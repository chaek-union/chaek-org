import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';
import { getBookRoot, parseSummary, getFilePaths } from './summary-parser';
import { processMarkdown } from './markdown-processor';

const CACHE_DIR = path.join(process.cwd(), 'data', 'book-translations');

const bookLanguageCache = new Map<string, 'ko' | 'en'>();
const preTranslateInProgress = new Set<string>();

// ── Language detection ─────────────────────────────────────────────────────

export async function detectBookLanguage(bookId: string): Promise<'ko' | 'en'> {
	const cached = bookLanguageCache.get(bookId);
	if (cached) return cached;

	const langCachePath = path.join(CACHE_DIR, bookId, '.language');
	try {
		const lang = (await fs.readFile(langCachePath, 'utf-8')).trim();
		if (lang === 'ko' || lang === 'en') {
			bookLanguageCache.set(bookId, lang);
			return lang;
		}
	} catch { /* no cache */ }

	const bookRoot = await getBookRoot(bookId);
	const navigation = await parseSummary(bookId);
	const filePaths = getFilePaths(navigation);

	const samplesToRead = filePaths.slice(0, 5);
	let totalChars = 0;
	let hangulChars = 0;

	for (const filePath of samplesToRead) {
		try {
			const content = await fs.readFile(path.join(bookRoot, filePath), 'utf-8');
			const stripped = content
				.replace(/```[\s\S]*?```/g, '')
				.replace(/`[^`]+`/g, '')
				.replace(/https?:\/\/\S+/g, '')
				.replace(/[^a-zA-Z\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '');
			totalChars += stripped.length;
			hangulChars += (stripped.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
		} catch { /* skip */ }
	}

	const lang: 'ko' | 'en' = totalChars > 0 && hangulChars / totalChars > 0.3 ? 'ko' : 'en';
	bookLanguageCache.set(bookId, lang);

	try {
		const dir = path.join(CACHE_DIR, bookId);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(langCachePath, lang, 'utf-8');
	} catch { /* non-critical */ }

	return lang;
}

// ── DeepL API ──────────────────────────────────────────────────────────────

async function callDeepL(text: string, sourceLang: string, targetLang: string, useXml = false): Promise<string> {
	const results = await callDeepLBatch([text], sourceLang, targetLang, useXml);
	return results[0];
}

async function callDeepLBatch(texts: string[], sourceLang: string, targetLang: string, useXml = false): Promise<string[]> {
	const authKey = env.DEEPL_AUTHKEY;
	if (!authKey) {
		console.warn('[translate] DEEPL_AUTHKEY not set, skipping translation');
		return texts;
	}

	const baseUrl = authKey.endsWith(':fx')
		? 'https://api-free.deepl.com/v2/translate'
		: 'https://api.deepl.com/v2/translate';

	const params = new URLSearchParams();
	for (const t of texts) params.append('text', t);
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
		return texts;
	}

	const data = await response.json();
	return data.translations.map((t: { text: string }) => t.text);
}

// ── Markdown protection ────────────────────────────────────────────────────

function xmlEscape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function protectMarkdown(markdown: string): { text: string; restore: (translated: string) => string } {
	const protected_: string[] = [];

	function protect(content: string): string {
		const idx = protected_.length;
		protected_.push(content);
		return `<x id="${idx}">${xmlEscape(content)}</x>`;
	}

	let result = markdown;
	result = result.replace(/(```[\s\S]*?```)/g, (_, block) => protect(block));
	result = result.replace(/(`[^`\n]+`)/g, (_, code) => protect(code));
	result = result.replace(/(!\[[^\]]*\]\([^)]+\))/g, (_, img) => protect(img));
	result = result.replace(/(\]\()([^)]+)(\))/g, (_, open, url, close) => `${open}${protect(url)}${close}`);
	result = result.replace(/(<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z]+>)/g, (match) => {
		if (match.includes('\n') || /^<(div|table|thead|tbody|tr|td|th|details|summary|pre|iframe|script|style)/i.test(match)) {
			return protect(match);
		}
		return match;
	});
	result = result.replace(/(<(?:br|hr|img)[^>]*\/?>)/gi, (_, tag) => protect(tag));

	function restore(translated: string): string {
		return translated.replace(/<x id="(\d+)">[\s\S]*?<\/x>/g, (_, idStr) => {
			const id = parseInt(idStr, 10);
			return id < protected_.length ? protected_[id] : '';
		});
	}

	return { text: result, restore };
}

function chunkMarkdown(text: string, maxChunk: number): string[] {
	const paragraphs = text.split(/\n\n/);
	const chunks: string[] = [];
	let current = '';

	for (const para of paragraphs) {
		if (current.length + para.length + 2 > maxChunk && current.length > 0) {
			chunks.push(current);
			current = para;
		} else {
			current = current ? current + '\n\n' + para : para;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

async function translateMarkdownContent(markdown: string, sourceLang: string, targetLang: string): Promise<string> {
	const { text: xmlText, restore } = protectMarkdown(markdown);
	const chunks = chunkMarkdown(xmlText, 30000);

	const BATCH_SIZE = 10;
	const translatedChunks: string[] = new Array(chunks.length);

	for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
		const batch = chunks.slice(i, i + BATCH_SIZE);
		const results = await callDeepLBatch(batch, sourceLang, targetLang, true);
		for (let j = 0; j < results.length; j++) {
			translatedChunks[i + j] = results[j];
		}
	}

	return restore(translatedChunks.join('\n\n'));
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function getTranslationCachePath(bookId: string, targetLang: string, pagePath: string): string {
	return path.join(CACHE_DIR, bookId, targetLang, pagePath);
}

function pageCacheExists(bookId: string, targetLang: string, pagePath: string): Promise<boolean> {
	return fs.access(getTranslationCachePath(bookId, targetLang, pagePath)).then(() => true).catch(() => false);
}

// ── Public API (cache-only reads, no DeepL on page visit) ──────────────────

/**
 * Read translated page from cache. Returns original if not cached.
 */
export async function translatePage(
	bookId: string,
	pagePath: string,
	markdown: string,
	targetLocale: 'ko' | 'en'
): Promise<{ markdown: string; translated: boolean }> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return { markdown, translated: false };

	try {
		const cached = await fs.readFile(getTranslationCachePath(bookId, targetLocale, pagePath), 'utf-8');
		return { markdown: cached, translated: true };
	} catch {
		return { markdown, translated: false };
	}
}

/**
 * Read translated navigation from cache. Returns original if not cached.
 */
export async function translateNavigation(
	bookId: string,
	navigation: Array<{ title: string; path?: string; children?: any[]; isHeader?: boolean }>,
	targetLocale: 'ko' | 'en'
): Promise<typeof navigation> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return navigation;

	try {
		return JSON.parse(await fs.readFile(path.join(CACHE_DIR, bookId, targetLocale, '_nav.json'), 'utf-8'));
	} catch {
		return navigation;
	}
}

/**
 * Read translated text from cache. Returns original if not cached.
 */
export async function translateText(
	bookId: string,
	text: string,
	targetLocale: 'ko' | 'en',
	cacheKey: string
): Promise<string> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return text;

	try {
		return await fs.readFile(path.join(CACHE_DIR, bookId, targetLocale, `_${cacheKey}.txt`), 'utf-8');
	} catch {
		return text;
	}
}

// ── Pre-translation (called during build or manual trigger only) ───────────

/**
 * Pre-translate an entire book: all pages, navigation titles, and book title.
 * Skips pages that are already cached.
 */
export async function preTranslateBook(bookId: string, targetLocale: 'ko' | 'en'): Promise<void> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return;

	const key = `${bookId}:${targetLocale}`;
	if (preTranslateInProgress.has(key)) return;
	preTranslateInProgress.add(key);

	try {
		console.log(`[translate] Pre-translating book ${bookId} → ${targetLocale}`);

		const bookRoot = await getBookRoot(bookId);
		const navigation = await parseSummary(bookId);
		const filePaths = getFilePaths(navigation);

		// 1. Navigation titles
		const navCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_nav.json');
		try {
			await fs.access(navCachePath);
		} catch {
			const titles: string[] = [];
			function collectTitles(items: typeof navigation) {
				for (const item of items) {
					if (item.title && item.title !== '__INTRODUCTION__') titles.push(item.title);
					if (item.children) collectTitles(item.children);
				}
			}
			collectTitles(navigation);

			if (titles.length > 0) {
				const translatedTitles = await callDeepLBatch(titles, bookLang, targetLocale);
				let idx = 0;
				function applyTitles(items: typeof navigation): typeof navigation {
					return items.map((item) => {
						const newItem = { ...item };
						if (item.title && item.title !== '__INTRODUCTION__' && idx < translatedTitles.length) {
							newItem.title = translatedTitles[idx].trim();
							idx++;
						}
						if (item.children) newItem.children = applyTitles(item.children);
						return newItem;
					});
				}
				const translatedNav = applyTitles(navigation);
				await fs.mkdir(path.dirname(navCachePath), { recursive: true });
				await fs.writeFile(navCachePath, JSON.stringify(translatedNav), 'utf-8');
			}
		}

		// 2. Book title
		const titleCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_title.txt');
		try {
			await fs.access(titleCachePath);
		} catch {
			try {
				const bookJsonPath = path.join(process.cwd(), 'books', bookId, 'book.json');
				const bookJson = JSON.parse(await fs.readFile(bookJsonPath, 'utf-8'));
				if (bookJson.title) {
					const translated = await callDeepL(bookJson.title, bookLang, targetLocale);
					await fs.mkdir(path.dirname(titleCachePath), { recursive: true });
					await fs.writeFile(titleCachePath, translated, 'utf-8');
				}
			} catch { /* no book.json or no title */ }
		}

		// 3. All pages
		for (const filePath of filePaths) {
			if (await pageCacheExists(bookId, targetLocale, filePath)) continue;

			try {
				const fullPath = path.join(bookRoot, filePath);
				let markdown = await fs.readFile(fullPath, 'utf-8');
				markdown = await processMarkdown(bookId, markdown);
				const translated = await translateMarkdownContent(markdown, bookLang, targetLocale);

				const cachePath = getTranslationCachePath(bookId, targetLocale, filePath);
				await fs.mkdir(path.dirname(cachePath), { recursive: true });
				await fs.writeFile(cachePath, translated, 'utf-8');

				console.log(`[translate] Cached ${bookId}/${filePath} → ${targetLocale}`);
			} catch (err) {
				console.error(`[translate] Failed to translate ${bookId}/${filePath}:`, err);
			}
		}

		console.log(`[translate] Pre-translation complete: ${bookId} → ${targetLocale}`);
	} catch (err) {
		console.error(`[translate] Pre-translation failed for ${bookId}:`, err);
		throw err;
	} finally {
		preTranslateInProgress.delete(key);
	}
}

/**
 * Invalidate translation cache for a book, then re-translate in background.
 */
export async function invalidateBookTranslations(bookId: string): Promise<void> {
	const bookCacheDir = path.join(CACHE_DIR, bookId);
	try {
		bookLanguageCache.delete(bookId);
		await fs.rm(bookCacheDir, { recursive: true, force: true });
		console.log(`[translate] Invalidated translation cache for ${bookId}`);
	} catch { /* non-critical */ }

	// Re-translate in background for both locales
	preTranslateBook(bookId, 'ko').catch(console.error);
	preTranslateBook(bookId, 'en').catch(console.error);
}
