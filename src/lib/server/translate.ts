import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';
import { getBookRoot, parseSummary, getFilePaths } from './summary-parser';

const CACHE_DIR = path.join(process.cwd(), 'data', 'book-translations');

// In-memory cache for detected book languages
const bookLanguageCache = new Map<string, 'ko' | 'en'>();

/**
 * Detect the majority language of a book by sampling its markdown content.
 * Uses Hangul character ratio to determine ko vs en.
 */
export async function detectBookLanguage(bookId: string): Promise<'ko' | 'en'> {
	const cached = bookLanguageCache.get(bookId);
	if (cached) return cached;

	// Also check file-based cache
	const langCachePath = path.join(CACHE_DIR, bookId, '.language');
	try {
		const lang = (await fs.readFile(langCachePath, 'utf-8')).trim();
		if (lang === 'ko' || lang === 'en') {
			bookLanguageCache.set(bookId, lang);
			return lang;
		}
	} catch {
		// No cache file
	}

	const bookRoot = await getBookRoot(bookId);
	const navigation = await parseSummary(bookId);
	const filePaths = getFilePaths(navigation);

	// Sample up to 5 files
	const samplesToRead = filePaths.slice(0, 5);
	let totalChars = 0;
	let hangulChars = 0;

	for (const filePath of samplesToRead) {
		try {
			const content = await fs.readFile(path.join(bookRoot, filePath), 'utf-8');
			// Strip code blocks and URLs to avoid false signals
			const stripped = content
				.replace(/```[\s\S]*?```/g, '')
				.replace(/`[^`]+`/g, '')
				.replace(/https?:\/\/\S+/g, '')
				.replace(/[^a-zA-Z\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '');

			totalChars += stripped.length;
			hangulChars += (stripped.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
		} catch {
			// Skip unreadable files
		}
	}

	const lang: 'ko' | 'en' = totalChars > 0 && hangulChars / totalChars > 0.3 ? 'ko' : 'en';
	bookLanguageCache.set(bookId, lang);

	// Persist to file
	try {
		const dir = path.join(CACHE_DIR, bookId);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(langCachePath, lang, 'utf-8');
	} catch {
		// Non-critical
	}

	return lang;
}

/**
 * Translate a single text string if the book language differs from the target locale.
 * Cached per bookId/targetLocale/cacheKey.
 */
export async function translateText(
	bookId: string,
	text: string,
	targetLocale: 'ko' | 'en',
	cacheKey: string
): Promise<string> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return text;

	const cachePath = path.join(CACHE_DIR, bookId, targetLocale, `_${cacheKey}.txt`);
	try {
		return await fs.readFile(cachePath, 'utf-8');
	} catch {
		// Cache miss
	}

	const translated = await callDeepL(text, bookLang, targetLocale);
	try {
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(cachePath, translated, 'utf-8');
	} catch {
		// Non-critical
	}
	return translated;
}

/**
 * Translate text using DeepL API with XML tag handling.
 * Content wrapped in <x> tags is preserved untranslated.
 */
async function callDeepL(
	text: string,
	sourceLang: string,
	targetLang: string,
	useXml = false
): Promise<string> {
	const authKey = env.DEEPL_AUTHKEY;
	if (!authKey) {
		console.warn('[translate] DEEPL_AUTHKEY not set, skipping translation');
		return text;
	}

	const baseUrl = authKey.endsWith(':fx')
		? 'https://api-free.deepl.com/v2/translate'
		: 'https://api.deepl.com/v2/translate';

	const params = new URLSearchParams();
	params.append('text', text);
	params.append('source_lang', sourceLang.toUpperCase());
	params.append('target_lang', targetLang.toUpperCase());
	if (useXml) {
		params.append('tag_handling', 'xml');
		params.append('ignore_tags', 'x');
	}

	const response = await fetch(baseUrl, {
		method: 'POST',
		headers: {
			'Authorization': `DeepL-Auth-Key ${authKey}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: params.toString()
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[translate] DeepL API error ${response.status}: ${errorText}`);
		return text;
	}

	const data = await response.json();
	return data.translations[0].text;
}

/**
 * Escape text for safe embedding inside XML.
 */
function xmlEscape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wrap non-translatable content in <x> tags for DeepL XML mode.
 * This protects code blocks, inline code, images, link URLs,
 * and markdown structural syntax from being modified.
 */
function protectMarkdown(markdown: string): { text: string; restore: (translated: string) => string } {
	const protected_: string[] = [];

	function protect(content: string): string {
		const idx = protected_.length;
		protected_.push(content);
		return `<x id="${idx}">${xmlEscape(content)}</x>`;
	}

	let result = markdown;

	// 1. Fenced code blocks (```...```)
	result = result.replace(/(```[\s\S]*?```)/g, (_, block) => protect(block));

	// 2. Inline code (`...`)
	result = result.replace(/(`[^`\n]+`)/g, (_, code) => protect(code));

	// 3. Images: protect full syntax ![alt](url)
	result = result.replace(/(!\[[^\]]*\]\([^)]+\))/g, (_, img) => protect(img));

	// 4. Links: translate the text but protect the URL part
	//    [text](url) → [text](<x>url</x>)
	result = result.replace(/(\]\()([^)]+)(\))/g, (_, open, url, close) => {
		return `${open}${protect(url)}${close}`;
	});

	// 5. HTML blocks (full tags like <div>, <p>, <details>, etc.)
	result = result.replace(/(<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z]+>)/g, (match) => {
		// Only protect multi-line or block-level HTML
		if (match.includes('\n') || /^<(div|table|thead|tbody|tr|td|th|details|summary|pre|iframe|script|style)/i.test(match)) {
			return protect(match);
		}
		return match;
	});

	// 6. Standalone HTML tags (self-closing or void)
	result = result.replace(/(<(?:br|hr|img)[^>]*\/?>)/gi, (_, tag) => protect(tag));

	// 7. Header markers: protect the # prefix but let the text be translated
	//    We don't protect headers entirely since their text should be translated

	function restore(translated: string): string {
		// Restore protected content from <x id="N">...</x> tags
		return translated.replace(/<x id="(\d+)">[\s\S]*?<\/x>/g, (_, idStr) => {
			const id = parseInt(idStr, 10);
			return id < protected_.length ? protected_[id] : '';
		});
	}

	return { text: result, restore };
}

/**
 * Split markdown into paragraph-level chunks, respecting a max size.
 * Splits on double newlines (paragraph boundaries) to avoid breaking
 * mid-sentence or mid-structure.
 */
function chunkMarkdown(text: string, maxChunk: number): string[] {
	const paragraphs = text.split(/\n\n/);
	const chunks: string[] = [];
	let current = '';

	for (const para of paragraphs) {
		const addition = current ? '\n\n' + para : para;
		if (current.length + addition.length > maxChunk && current.length > 0) {
			chunks.push(current);
			current = para;
		} else {
			current = current ? current + '\n\n' + para : para;
		}
	}
	if (current) chunks.push(current);

	return chunks;
}

/**
 * Translate markdown content while preserving code blocks, inline code,
 * images, link URLs, and HTML blocks.
 *
 * Uses DeepL XML tag handling to protect non-translatable content,
 * paragraph-level chunking, and sequential requests to avoid truncation.
 */
async function translateMarkdownContent(
	markdown: string,
	sourceLang: string,
	targetLang: string
): Promise<string> {
	const { text: xmlText, restore } = protectMarkdown(markdown);

	// Split into manageable chunks at paragraph boundaries
	// 4000 chars keeps well under DeepL's limits even after URL-encoding
	const chunks = chunkMarkdown(xmlText, 4000);

	// Translate sequentially to avoid rate limits and preserve order
	const translatedChunks: string[] = [];
	for (const chunk of chunks) {
		const translated = await callDeepL(chunk, sourceLang, targetLang, true);
		translatedChunks.push(translated);
	}

	const joined = translatedChunks.join('\n\n');
	return restore(joined);
}

/**
 * Get the cache path for a translated page.
 */
function getTranslationCachePath(bookId: string, targetLang: string, pagePath: string): string {
	return path.join(CACHE_DIR, bookId, targetLang, pagePath);
}

/**
 * Translate a book page's markdown content if needed.
 * Returns the original markdown if the book language matches the target locale,
 * or the translated markdown if it differs.
 * Results are cached to disk.
 */
export async function translatePage(
	bookId: string,
	pagePath: string,
	markdown: string,
	targetLocale: 'ko' | 'en'
): Promise<{ markdown: string; translated: boolean }> {
	const bookLang = await detectBookLanguage(bookId);

	// No translation needed if languages match
	if (bookLang === targetLocale) {
		return { markdown, translated: false };
	}

	// Check disk cache
	const cachePath = getTranslationCachePath(bookId, targetLocale, pagePath);
	try {
		const cached = await fs.readFile(cachePath, 'utf-8');
		return { markdown: cached, translated: true };
	} catch {
		// Cache miss
	}

	// Translate
	console.log(`[translate] Translating ${bookId}/${pagePath} from ${bookLang} to ${targetLocale}`);
	const translated = await translateMarkdownContent(markdown, bookLang, targetLocale);

	// Save to cache
	try {
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(cachePath, translated, 'utf-8');
	} catch (err) {
		console.error(`[translate] Failed to cache translation:`, err);
	}

	return { markdown: translated, translated: true };
}

/**
 * Translate navigation titles for the sidebar.
 * Batch-translates all titles in a single DeepL call and caches the result.
 */
export async function translateNavigation(
	bookId: string,
	navigation: Array<{ title: string; path?: string; children?: any[]; isHeader?: boolean }>,
	targetLocale: 'ko' | 'en'
): Promise<typeof navigation> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return navigation;

	// Check cache
	const cachePath = path.join(CACHE_DIR, bookId, targetLocale, '_nav.json');
	try {
		const cached = await fs.readFile(cachePath, 'utf-8');
		return JSON.parse(cached);
	} catch {
		// Cache miss
	}

	// Collect all titles to translate
	const titles: string[] = [];
	function collectTitles(items: typeof navigation) {
		for (const item of items) {
			if (item.title && item.title !== '__INTRODUCTION__') {
				titles.push(item.title);
			}
			if (item.children) collectTitles(item.children);
		}
	}
	collectTitles(navigation);

	if (titles.length === 0) return navigation;

	// Translate each title individually for reliability
	const translatedTitles: string[] = [];
	for (const title of titles) {
		const translated = await callDeepL(title, bookLang, targetLocale);
		translatedTitles.push(translated);
	}

	// Apply translated titles back
	let idx = 0;
	function applyTitles(items: typeof navigation): typeof navigation {
		return items.map((item) => {
			const newItem = { ...item };
			if (item.title && item.title !== '__INTRODUCTION__' && idx < translatedTitles.length) {
				newItem.title = translatedTitles[idx].trim();
				idx++;
			}
			if (item.children) {
				newItem.children = applyTitles(item.children);
			}
			return newItem;
		});
	}
	const translated = applyTitles(navigation);

	// Cache
	try {
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(cachePath, JSON.stringify(translated), 'utf-8');
	} catch {
		// Non-critical
	}

	return translated;
}

/**
 * Invalidate translation cache for a book (e.g., after a new build).
 */
export async function invalidateBookTranslations(bookId: string): Promise<void> {
	const bookCacheDir = path.join(CACHE_DIR, bookId);
	try {
		// Remove language cache to force re-detection
		bookLanguageCache.delete(bookId);
		await fs.rm(bookCacheDir, { recursive: true, force: true });
		console.log(`[translate] Invalidated translation cache for ${bookId}`);
	} catch {
		// Non-critical
	}
}
