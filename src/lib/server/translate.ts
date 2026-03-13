import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';
import { getBookRoot, parseSummary, getFilePaths } from './summary-parser';
import { processMarkdown } from './markdown-processor';
import { createTranslationLog, updateTranslationLog } from './db/translation-logs';
import { translationEvents } from './translation-events';

const CACHE_DIR = path.join(process.cwd(), 'data', 'book-translations');

const bookLanguageCache = new Map<string, 'ko' | 'en'>();
const preTranslateInProgress = new Set<string>();

const VLLM_BASE_URL = env.VLLM_BASE_URL || 'http://10.125.208.42:9241';
const VLLM_MODEL = env.VLLM_MODEL || '';
const VLLM_TIMEOUT_MS = 120_000;

const LANG_NAMES: Record<string, string> = { ko: 'Korean', en: 'English' };

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

// ── vLLM API ──────────────────────────────────────────────────────────────

async function resolveModel(): Promise<string> {
	if (VLLM_MODEL) return VLLM_MODEL;

	const response = await fetch(`${VLLM_BASE_URL}/v1/models`);
	if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);
	const data = await response.json();
	const id = data?.data?.[0]?.id;
	if (!id) throw new Error('No models available on vLLM server');
	return id;
}

let cachedModel: string | null = null;

async function getModel(): Promise<string> {
	if (!cachedModel) cachedModel = await resolveModel();
	return cachedModel;
}

async function callLLM(prompt: string, text: string): Promise<string> {
	const model = await getModel();

	const response = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: prompt },
				{ role: 'user', content: text }
			],
			temperature: 0.1,
			max_tokens: 2048
		}),
		signal: AbortSignal.timeout(VLLM_TIMEOUT_MS)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`vLLM API error ${response.status}: ${errorText}`);
	}

	const data = await response.json();
	return data.choices[0].message.content.trim();
}

function buildTranslatePrompt(sourceLang: string, targetLang: string, isMarkdown: boolean): string {
	const src = LANG_NAMES[sourceLang] || sourceLang;
	const tgt = LANG_NAMES[targetLang] || targetLang;

	if (isMarkdown) {
		return [
			`You are a professional translator. Translate the following Markdown from ${src} to ${tgt}.`,
			'Rules:',
			'- Preserve ALL Markdown formatting exactly (headings, lists, bold, italic, links, etc.)',
			'- Preserve all <x id="..."/> placeholder tags exactly as-is, do not translate or modify them',
			'- Do not add, remove, or reorder any structural elements',
			'- Translate only the natural language text content',
			'- Do not wrap the output in code fences or add any extra text',
			'- Output ONLY the translated Markdown, nothing else'
		].join('\n');
	}

	return `You are a professional translator. Translate the following text from ${src} to ${tgt}. Output ONLY the translation, nothing else.`;
}

async function translateSingle(text: string, sourceLang: string, targetLang: string, isMarkdown = false): Promise<string> {
	const prompt = buildTranslatePrompt(sourceLang, targetLang, isMarkdown);
	return callLLM(prompt, text);
}

async function translateBatch(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
	const results: string[] = [];
	for (let i = 0; i < texts.length; i++) {
		results.push(await translateSingle(texts[i], sourceLang, targetLang));
	}
	return results;
}

// ── Markdown protection ────────────────────────────────────────────────────

function protectMarkdown(markdown: string): { text: string; restore: (translated: string) => string } {
	const protected_: string[] = [];

	function protect(content: string): string {
		const idx = protected_.length;
		protected_.push(content);
		// Use a single-line placeholder so chunking on \n\n never splits a protected block
		return `<x id="${idx}"/>`;
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
		return translated.replace(/<x id="(\d+)"\/>/g, (_, idStr) => {
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
	const { text: protectedText, restore } = protectMarkdown(markdown);
	const chunks = chunkMarkdown(protectedText, 1500);

	const translatedChunks: string[] = [];
	for (const chunk of chunks) {
		const translated = await translateSingle(chunk, sourceLang, targetLang, true);
		translatedChunks.push(translated);
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

// ── Public API (cache-only reads) ───────────────────────────────────────────

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
 * Skips pages that are already cached. Logs progress to build_logs via SSE.
 * Returns the build log ID.
 */
export async function preTranslateBook(bookId: string, targetLocale: 'ko' | 'en', triggeredBy?: string): Promise<number | null> {
	const bookLang = await detectBookLanguage(bookId);
	if (bookLang === targetLocale) return null;

	const key = `${bookId}:${targetLocale}`;
	if (preTranslateInProgress.has(key)) return null;
	preTranslateInProgress.add(key);

	const translationLog = await createTranslationLog(bookId, targetLocale, triggeredBy);
	const logId = translationLog.id;

	const log = (msg: string) => translationEvents.emitLog(logId, 'stdout', msg);
	const logErr = (msg: string) => translationEvents.emitLog(logId, 'stderr', msg);

	try {
		await log(`Pre-translating ${bookId}: ${bookLang} → ${targetLocale}`);
		await translationEvents.emitStatus(logId, 'running');

		const bookRoot = await getBookRoot(bookId);
		const navigation = await parseSummary(bookId);
		const filePaths = getFilePaths(navigation);

		await log(`Found ${filePaths.length} pages to translate`);

		// 1. Navigation titles
		const navCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_nav.json');
		try {
			await fs.access(navCachePath);
			await log('Navigation titles: cached, skipping');
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
				await log(`Translating ${titles.length} navigation titles...`);
				const translatedTitles = await translateBatch(titles, bookLang, targetLocale);
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
				await log('Navigation titles: done');
			}
		}

		// 2. Book title
		const titleCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_title.txt');
		try {
			await fs.access(titleCachePath);
			await log('Book title: cached, skipping');
		} catch {
			try {
				const bookJsonPath = path.join(process.cwd(), 'books', bookId, 'book.json');
				const bookJson = JSON.parse(await fs.readFile(bookJsonPath, 'utf-8'));
				if (bookJson.title) {
					await log(`Translating book title: "${bookJson.title}"`);
					const translated = await translateSingle(bookJson.title, bookLang, targetLocale);
					await fs.mkdir(path.dirname(titleCachePath), { recursive: true });
					await fs.writeFile(titleCachePath, translated, 'utf-8');
					await log(`Book title: "${translated}"`);
				}
			} catch { /* no book.json or no title */ }
		}

		// 3. All pages (with retry)
		const MAX_RETRIES = 3;
		let pending = [...filePaths];
		const finalFailed: string[] = [];
		let completedCount = 0;
		let skippedCount = 0;

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			const failedThisRound: string[] = [];

			for (const filePath of pending) {
				if (await pageCacheExists(bookId, targetLocale, filePath)) {
					skippedCount++;
					continue;
				}

				try {
					const fullPath = path.join(bookRoot, filePath);
					let markdown = await fs.readFile(fullPath, 'utf-8');
					markdown = await processMarkdown(bookId, markdown);
					const translated = await translateMarkdownContent(markdown, bookLang, targetLocale);

					const cachePath = getTranslationCachePath(bookId, targetLocale, filePath);
					await fs.mkdir(path.dirname(cachePath), { recursive: true });
					await fs.writeFile(cachePath, translated, 'utf-8');

					completedCount++;
					await log(`[${completedCount + skippedCount}/${filePaths.length}] ${filePath}`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					await logErr(`Attempt ${attempt}/${MAX_RETRIES} failed: ${filePath} — ${msg}`);
					failedThisRound.push(filePath);
				}
			}

			if (failedThisRound.length === 0) break;

			if (attempt < MAX_RETRIES) {
				const retryDelay = attempt * 2000;
				await log(`Retrying ${failedThisRound.length} failed pages in ${retryDelay / 1000}s...`);
				await new Promise(r => setTimeout(r, retryDelay));
				pending = failedThisRound;
			} else {
				finalFailed.push(...failedThisRound);
			}
		}

		if (finalFailed.length > 0) {
			await logErr(`${finalFailed.length} pages failed after ${MAX_RETRIES} retries: ${finalFailed.join(', ')}`);
			await updateTranslationLog(logId, 'failed');
			await translationEvents.emitStatus(logId, 'failed');
			throw new Error(`Translation incomplete: ${finalFailed.length} pages failed`);
		}

		await log(`Translation complete: ${completedCount} translated, ${skippedCount} cached`);
		await updateTranslationLog(logId, 'success');
		await translationEvents.emitStatus(logId, 'success');
		return logId;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await logErr(`Translation failed: ${msg}`);
		try { await updateTranslationLog(logId, 'failed'); } catch { /* ignore */ }
		try { await translationEvents.emitStatus(logId, 'failed'); } catch { /* ignore */ }
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

	// Re-translate in background sequentially
	preTranslateBook(bookId, 'ko')
		.then(() => preTranslateBook(bookId, 'en'))
		.catch(console.error);
}
