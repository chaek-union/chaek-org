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
 * Translate markdown content using DeepL API.
 * Preserves code blocks by replacing them with placeholders before translation.
 */
async function callDeepL(text: string, sourceLang: string, targetLang: string): Promise<string> {
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
 * Translate markdown content while preserving code blocks, HTML tags, and links.
 */
async function translateMarkdownContent(
	markdown: string,
	sourceLang: string,
	targetLang: string
): Promise<string> {
	// Extract code blocks and replace with placeholders
	const codeBlocks: string[] = [];
	let processed = markdown.replace(/```[\s\S]*?```/g, (match) => {
		const idx = codeBlocks.length;
		codeBlocks.push(match);
		return `\n{{CODE_BLOCK_${idx}}}\n`;
	});

	// Extract inline code
	const inlineCode: string[] = [];
	processed = processed.replace(/`[^`]+`/g, (match) => {
		const idx = inlineCode.length;
		inlineCode.push(match);
		return `{{INLINE_CODE_${idx}}}`;
	});

	// Split into chunks if too large (DeepL limit ~128KB)
	const MAX_CHUNK = 50000;
	const lines = processed.split('\n');
	const chunks: string[] = [];
	let currentChunk = '';

	for (const line of lines) {
		if (currentChunk.length + line.length + 1 > MAX_CHUNK && currentChunk.length > 0) {
			chunks.push(currentChunk);
			currentChunk = line;
		} else {
			currentChunk += (currentChunk ? '\n' : '') + line;
		}
	}
	if (currentChunk) chunks.push(currentChunk);

	// Translate each chunk
	const translatedChunks = await Promise.all(
		chunks.map((chunk) => callDeepL(chunk, sourceLang, targetLang))
	);

	let result = translatedChunks.join('\n');

	// Restore code blocks
	for (let i = 0; i < codeBlocks.length; i++) {
		result = result.replace(`{{CODE_BLOCK_${i}}}`, codeBlocks[i]);
	}

	// Restore inline code
	for (let i = 0; i < inlineCode.length; i++) {
		result = result.replace(`{{INLINE_CODE_${i}}}`, inlineCode[i]);
	}

	return result;
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
