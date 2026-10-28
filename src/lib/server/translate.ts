import fs from 'fs/promises';
import path from 'path';
import { simpleGit } from 'simple-git';
import { getBookRoot, parseSummary, getFilePaths } from './summary-parser';
import { processMarkdown } from './markdown-processor';
import { createTranslationLog, updateTranslationLog } from './db/translation-logs';
import { translationEvents } from './translation-events';
import { BOOKS_DIR } from './books';
import { loadBookGlossary, buildGlossaryPrompt, invalidateGlossaryCache } from './glossary';
import { callLLM } from './llm';

const CACHE_DIR = path.join(process.cwd(), 'data', 'book-translations');

const bookLanguageCache = new Map<string, 'ko' | 'en'>();
const activeTranslations = new Map<string, AbortController>();

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

// ── Translation prompt ─────────────────────────────────────────────────────

function buildTranslatePrompt(sourceLang: string, targetLang: string, isMarkdown: boolean, glossaryText = ''): string {
	const src = LANG_NAMES[sourceLang] || sourceLang;
	const tgt = LANG_NAMES[targetLang] || targetLang;

	const style = targetLang === 'ko'
		? '- Write natural, fluent academic Korean as found in a university textbook. Keep the sentence-ending style of a Korean textbook consistent (합니다체 for prose unless the source is clearly informal). Technical terms may keep the English in parentheses on first use, e.g. 전사체(transcriptome).\n- Write only in Hangul. Never use Chinese characters (漢字/汉字), not even for technical terms.\n- Quotations in languages other than English (e.g. German or Latin) may stay in the original language.'
		: '- Write natural, fluent academic English as found in a university textbook. Do not leave any Korean words; romanize or translate Korean proper nouns.';

	if (isMarkdown) {
		return [
			`You are a professional translator of university textbooks. Translate the following Markdown from ${src} to ${tgt}.`,
			'Rules:',
			`- Translate EVERY sentence, heading, list item, table cell, blockquote, image caption and HTML text node into ${tgt}. Never leave a sentence in ${src}, never summarize, never skip a paragraph.`,
			'- Preserve ALL Markdown formatting exactly (headings, lists, bold, italic, tables, blockquotes, links, HTML tags and attributes)',
			'- Every <x id="N"/> tag is a placeholder for code, a URL or an image. Copy each one exactly once, unchanged, at the matching position. Do not add, drop, renumber or reformat them.',
			'- Keep code identifiers, gene/protein symbols, file names, commands, numbers and citations unchanged',
			'- Do not add, remove, or reorder any structural elements',
			style,
			'- Do not wrap the output in code fences, do not add notes or explanations',
			'- Output ONLY the translated Markdown, nothing else',
			glossaryText
		].join('\n');
	}

	return `You are a professional translator of university textbooks. Translate the following text from ${src} to ${tgt}. Translate it completely; do not leave any ${src} words except proper nouns, code or symbols. Do not add a trailing period/dot that was not in the original. Output ONLY the translation, nothing else.${glossaryText}`;
}

// ── Translation validation ─────────────────────────────────────────────────

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/g;
const LATIN_RE = /[A-Za-z]/g;
const HAN_RE = /[一-鿿]/g;
const PLACEHOLDER_RE = /<x id="\d+"\/>/g;
const ENGLISH_FUNCTION_WORDS_RE = /\b(the|and|of|to|is|are|was|were|in|that|with|for|this|by|as|it|be|from|which)\b/gi;
const QUOTED_RE = /"[^"\n]*"|“[^”\n]*”/g;
// Reference-list entries: "Smith et al.", "Ji, Y.", "Zhou & Troyanskaya", DOIs
const CITATION_RE = /et al\.|\bdoi\b|\b[A-Z][a-z]+,\s+[A-Z]\.|\b[A-Z][a-z]+ & [A-Z][a-z]+/;

function proseOnly(text: string): string {
	return text
		.replace(PLACEHOLDER_RE, ' ')
		// Only real tags: comparisons like "<40 kb ... >1 kb" are prose
		.replace(/<\/?[a-zA-Z][^<>\n]*>/g, ' ')
		.replace(/\$\$[\s\S]*?\$\$/g, ' ')
		.replace(/\$[^$\n]+\$/g, ' ')
		.replace(/https?:\/\/\S+/g, ' ')
		// Parenthesized terms are allowed to stay in the other language, e.g. 전사체(transcriptome)
		.replace(/\([^()\n]{0,80}\)/g, ' ');
}

/**
 * Check a translated chunk against its source. Returns a description of the
 * problem, or null if the translation looks complete.
 */
function validateTranslation(source: string, translated: string, sourceLang: string, targetLang: string): string | null {
	if (!translated.trim()) return 'the output was empty';

	const srcPlaceholders: string[] = (source.match(PLACEHOLDER_RE) || []).sort();
	const outPlaceholders: string[] = (translated.match(PLACEHOLDER_RE) || []).sort();
	// Mangled variants such as <x id="28"> or <x id="placeholder"/> would not be restored
	if ((translated.match(/<x\b[^>]*>/g) || []).length !== outPlaceholders.length) {
		return 'some placeholder tags were altered; copy each <x id="N"/> tag exactly as written';
	}
	if (srcPlaceholders.join() !== outPlaceholders.join()) {
		const missing = srcPlaceholders.filter(p => !outPlaceholders.includes(p));
		return missing.length > 0
			? `these placeholder tags are missing: ${missing.join(' ')}`
			: 'placeholder tags were duplicated or invented';
	}

	const srcProse = proseOnly(source);
	const outProse = proseOnly(translated);
	const srcLetters = (srcProse.match(HANGUL_RE) || []).length + (srcProse.match(LATIN_RE) || []).length;
	// Chunks that are almost all code/placeholders have nothing to check
	if (srcLetters < 20) return null;

	// The chunk must be in the target language. Quoted examples and reference
	// entries legitimately stay in the original language, so only fail when a
	// large share of the chunk, or a whole long paragraph, was left as is.
	let totalLetters = 0;
	let untranslatedLetters = 0;
	for (const para of outProse.replace(QUOTED_RE, ' ').split(/\n\s*\n/)) {
		const hangul = (para.match(HANGUL_RE) || []).length;
		const latin = (para.match(LATIN_RE) || []).length;
		totalLetters += hangul + latin;
		if (hangul + latin < 30 || CITATION_RE.test(para)) continue;
		// Latin-script text only counts as untranslated if it reads as English
		// (quotes in German, Latin etc. may stay); a few Korean words can be
		// legitimate examples quoted in English text.
		const englishWords = (para.match(ENGLISH_FUNCTION_WORDS_RE) || []).length;
		const untranslated = targetLang === 'ko'
			? hangul < latin * 0.3 && englishWords >= 3
			: hangul > latin * 0.15;
		if (!untranslated) continue;
		if (hangul + latin >= 300) return `this paragraph was left untranslated: "${para.trim().slice(0, 120)}"`;
		untranslatedLetters += hangul + latin;
	}
	if (untranslatedLetters > totalLetters * 0.25) return 'a large part of the text was left untranslated';

	const srcHan = new Set(srcProse.match(HAN_RE) || []);
	const newHan = [...new Set(outProse.match(HAN_RE) || [])].filter(c => !srcHan.has(c));
	if (newHan.length > 0) {
		return `Chinese characters appeared in the output (${newHan.slice(0, 10).join('')}); write those words in ${targetLang === 'ko' ? 'Hangul' : 'English'}`;
	}

	// Length sanity check (Korean text is roughly 2-3x denser than English);
	// short chunks such as lone headings vary too much to judge
	if (srcLetters < 200) return null;
	const ratio = outProse.trim().length / Math.max(srcProse.trim().length, 1);
	const [min, max] = sourceLang === 'en' && targetLang === 'ko' ? [0.2, 1.5] : [1.0, 6];
	if (ratio < min) return 'the output is much shorter than the source; some content was dropped';
	if (ratio > max) return 'the output is much longer than the source; content was added or repeated';

	return null;
}

// Sampling temperature per attempt. The quantized model occasionally samples a
// token that is invalid UTF-8, which llama-server rejects with HTTP 500;
// another temperature usually avoids it.
const CHUNK_TEMPERATURES = [0.1, 0.4, 0.7, 0.4, 0.7];
// From this attempt on (or right after a Chinese-character leak), constrain
// sampling to valid characters other than CJK ideographs. Kept as a fallback
// because a blocked byte token is replaced by the next-best, possibly odd, syllable.
const GRAMMAR_FROM_ATTEMPT = 3;
const NO_HAN_GRAMMAR = 'root ::= [^\\u4E00-\\u9FFF]*';

async function translateSingle(text: string, sourceLang: string, targetLang: string, isMarkdown = false, glossaryText = '', signal?: AbortSignal): Promise<string> {
	const prompt = buildTranslatePrompt(sourceLang, targetLang, isMarkdown, glossaryText);
	const messages = [
		{ role: 'system' as const, content: prompt },
		{ role: 'user' as const, content: text }
	];
	// Reasoning eats the token budget and leaves the answer empty; translation
	// quality comes from the prompt and the validation loop instead.
	const options = { temperature: 0.1, maxTokens: 8192, thinking: 'off' as const, signal };

	if (!isMarkdown) return callLLM(messages, options);

	let lastProblem = '';
	let feedback = '';
	let hanLeaked = false;
	// The grammar would also forbid ideographs the source itself contains
	const grammarAllowed = !text.match(HAN_RE);
	for (const [attempt, temperature] of CHUNK_TEMPERATURES.entries()) {
		const grammar = grammarAllowed && (hanLeaked || attempt >= GRAMMAR_FROM_ATTEMPT) ? NO_HAN_GRAMMAR : undefined;
		let translated: string;
		try {
			translated = await callLLM(
				feedback
					? [...messages, { role: 'user' as const, content: `Your previous translation was rejected because ${feedback}. Translate the Markdown above again, completely and following every rule.` }]
					: messages,
				{ ...options, temperature, grammar }
			);
		} catch (err) {
			if (signal?.aborted || !(err instanceof Error) || !err.message.startsWith('LLM API error 5')) throw err;
			lastProblem = err.message;
			continue;
		}
		const problem = validateTranslation(text, translated, sourceLang, targetLang);
		if (!problem) return translated;
		lastProblem = feedback = problem;
		if (problem.startsWith('Chinese characters')) hanLeaked = true;
	}
	throw new Error(`Chunk failed after ${CHUNK_TEMPERATURES.length} attempts: ${lastProblem}`);
}

async function translateBatch(texts: string[], sourceLang: string, targetLang: string, glossaryText = '', signal?: AbortSignal): Promise<string[]> {
	const results: string[] = [];
	for (let i = 0; i < texts.length; i++) {
		results.push(await translateSingle(texts[i], sourceLang, targetLang, false, glossaryText, signal));
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
	// HTML whose content is not prose is protected whole; everywhere else only
	// the tags themselves are, so text inside <details>, tables etc. is translated
	result = result.replace(/<!--[\s\S]*?-->/g, (comment) => protect(comment));
	result = result.replace(/<(pre|script|style|code|svg|iframe|math)\b[\s\S]*?<\/\1>/gi, (block) => protect(block));
	// Skip <x .../> placeholders, which look like tags
	result = result.replace(/<\/?(?!x id=)[a-zA-Z][^<>]*>/g, (tag) => protect(tag));

	function restore(translated: string): string {
		// Protected blocks can contain earlier placeholders, so restore until stable
		let result = translated;
		for (let depth = 0; depth < 5 && /<x id="\d+"\/>/.test(result); depth++) {
			result = result.replace(/<x id="(\d+)"\/>/g, (_, idStr) => {
				const id = parseInt(idStr, 10);
				return id < protected_.length ? protected_[id] : '';
			});
		}
		return result;
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

async function translateMarkdownContent(markdown: string, sourceLang: string, targetLang: string, glossaryText = '', signal?: AbortSignal): Promise<string> {
	const { text: protectedText, restore } = protectMarkdown(markdown);
	const chunks = chunkMarkdown(protectedText, 1500);

	const translatedChunks: string[] = [];
	for (const chunk of chunks) {
		const translated = await translateSingle(chunk, sourceLang, targetLang, true, glossaryText, signal);
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

function getHashPath(bookId: string, targetLang: string, pagePath: string): string {
	return getTranslationCachePath(bookId, targetLang, pagePath) + '.hash';
}

async function getStoredHash(bookId: string, targetLang: string, pagePath: string): Promise<string | null> {
	try {
		return (await fs.readFile(getHashPath(bookId, targetLang, pagePath), 'utf-8')).trim();
	} catch {
		return null;
	}
}

async function saveHash(bookId: string, targetLang: string, pagePath: string, hash: string): Promise<void> {
	const hashPath = getHashPath(bookId, targetLang, pagePath);
	await fs.mkdir(path.dirname(hashPath), { recursive: true });
	await fs.writeFile(hashPath, hash, 'utf-8');
}

/**
 * Get git file hashes for all files in a book repo.
 * Returns a map of relative file path → git blob hash.
 */
async function getGitFileHashes(bookId: string): Promise<Map<string, string>> {
	const repoDir = path.join(BOOKS_DIR, bookId);
	const git = simpleGit(repoDir);
	const hashes = new Map<string, string>();

	try {
		// ls-tree -r HEAD gives: <mode> <type> <hash>\t<path>
		const result = await git.raw(['ls-tree', '-r', 'HEAD']);
		for (const line of result.trim().split('\n')) {
			if (!line) continue;
			const match = line.match(/^\d+\s+\w+\s+([a-f0-9]+)\t(.+)$/);
			if (match) {
				hashes.set(match[2], match[1]);
			}
		}
	} catch {
		// Not a git repo or no HEAD, return empty
	}

	return hashes;
}

/**
 * Check if a page needs re-translation by comparing git hashes.
 * Returns true if translation is needed (file changed or no cache).
 */
async function pageNeedsTranslation(
	bookId: string, targetLang: string, pagePath: string, currentHash: string | undefined
): Promise<boolean> {
	if (!currentHash) return true; // No git hash available, translate
	if (!await pageCacheExists(bookId, targetLang, pagePath)) return true; // No cache
	const storedHash = await getStoredHash(bookId, targetLang, pagePath);
	return storedHash !== currentHash; // Hash mismatch = content changed
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

	// Cancel any previous translation for this book (both locales)
	for (const [k, ctrl] of activeTranslations) {
		if (k.startsWith(`${bookId}:`)) {
			ctrl.abort();
		}
	}

	const abortController = new AbortController();
	activeTranslations.set(key, abortController);
	const signal = abortController.signal;

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

		// Load glossary for this book
		const glossaryEntries = await loadBookGlossary(bookId);
		const glossaryText = buildGlossaryPrompt(glossaryEntries, bookLang, targetLocale);
		if (glossaryEntries.length > 0) {
			await log(`Loaded ${glossaryEntries.length} glossary term(s)`);
		}

		// Get git hashes for change detection
		const gitHashes = await getGitFileHashes(bookId);
		await log(`Found ${filePaths.length} pages, ${gitHashes.size} git-tracked files`);

		// 1. Navigation titles — always re-translate (SUMMARY.md may have changed)
		const navCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_nav.json');
		const summaryHash = gitHashes.get('SUMMARY.md');
		const navStoredHash = await getStoredHash(bookId, targetLocale, '_nav.json');
		if (navStoredHash && navStoredHash === summaryHash) {
			await log('Navigation titles: unchanged, skipping');
		} else {
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
				const translatedTitles = await translateBatch(titles, bookLang, targetLocale, glossaryText, signal);
				let idx = 0;
				function applyTitles(items: typeof navigation): typeof navigation {
					return items.map((item) => {
						const newItem = { ...item };
						if (item.title && item.title !== '__INTRODUCTION__' && idx < translatedTitles.length) {
							newItem.title = translatedTitles[idx].trim().replace(/\.$/, '');
							idx++;
						}
						if (item.children) newItem.children = applyTitles(item.children);
						return newItem;
					});
				}
				const translatedNav = applyTitles(navigation);
				await fs.mkdir(path.dirname(navCachePath), { recursive: true });
				await fs.writeFile(navCachePath, JSON.stringify(translatedNav), 'utf-8');
				if (summaryHash) await saveHash(bookId, targetLocale, '_nav.json', summaryHash);
				await log('Navigation titles: done');
			}
		}

		// 2. Book title — re-translate if book.json changed
		const titleCachePath = path.join(CACHE_DIR, bookId, targetLocale, '_title.txt');
		const bookJsonHash = gitHashes.get('book.json');
		const titleStoredHash = await getStoredHash(bookId, targetLocale, '_title.txt');
		if (titleStoredHash && titleStoredHash === bookJsonHash) {
			await log('Book title: unchanged, skipping');
		} else {
			try {
				const bookJsonPath = path.join(process.cwd(), 'books', bookId, 'book.json');
				const bookJson = JSON.parse(await fs.readFile(bookJsonPath, 'utf-8'));
				if (bookJson.title) {
					await log(`Translating book title: "${bookJson.title}"`);
					const translated = (await translateSingle(bookJson.title, bookLang, targetLocale, false, glossaryText, signal)).replace(/\.$/, '');
					await fs.mkdir(path.dirname(titleCachePath), { recursive: true });
					await fs.writeFile(titleCachePath, translated, 'utf-8');
					if (bookJsonHash) await saveHash(bookId, targetLocale, '_title.txt', bookJsonHash);
					await log(`Book title: "${translated}"`);
				}
			} catch { /* no book.json or no title */ }
		}

		// 3. All pages — only translate if git hash changed
		const MAX_RETRIES = 3;
		let pending = [...filePaths];
		const finalFailed: string[] = [];
		let completedCount = 0;
		let skippedCount = 0;

		// Resolve file paths relative to book root for git hash lookup
		const bookRootRelative = path.relative(path.join(BOOKS_DIR, bookId), bookRoot);

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			const failedThisRound: string[] = [];

			for (const filePath of pending) {
				// Look up git hash for this file
				const gitPath = bookRootRelative ? path.join(bookRootRelative, filePath) : filePath;
				const currentHash = gitHashes.get(gitPath) || gitHashes.get(filePath);

				if (!await pageNeedsTranslation(bookId, targetLocale, filePath, currentHash)) {
					skippedCount++;
					await log(`[${completedCount + skippedCount}/${filePaths.length}] ${filePath} (unchanged)`);
					continue;
				}

				try {
					if (signal.aborted) throw new Error('Translation cancelled');
					const fullPath = path.join(bookRoot, filePath);
					let markdown = await fs.readFile(fullPath, 'utf-8');
					markdown = await processMarkdown(bookId, markdown, { bookRoot });
					const translated = await translateMarkdownContent(markdown, bookLang, targetLocale, glossaryText, signal);

					const cachePath = getTranslationCachePath(bookId, targetLocale, filePath);
					await fs.mkdir(path.dirname(cachePath), { recursive: true });
					await fs.writeFile(cachePath, translated, 'utf-8');
					if (currentHash) await saveHash(bookId, targetLocale, filePath, currentHash);

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

		await log(`Translation complete: ${completedCount} translated, ${skippedCount} unchanged`);
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
		if (activeTranslations.get(key) === abortController) {
			activeTranslations.delete(key);
		}
	}
}

/**
 * Cancel all active translations for a book.
 */
export function cancelBookTranslations(bookId: string): void {
	for (const [k, ctrl] of activeTranslations) {
		if (k.startsWith(`${bookId}:`)) {
			ctrl.abort();
		}
	}
}

/**
 * Re-translate a book in the background.
 * Git hash comparison ensures only changed pages are re-translated.
 */
export async function invalidateBookTranslations(bookId: string): Promise<void> {
	bookLanguageCache.delete(bookId);
	invalidateGlossaryCache(bookId);
	console.log(`[translate] Triggering re-translation for ${bookId} (git-based change detection)`);

	// Delete stale navigation and title caches so fresh (untranslated) data
	// is served until re-translation completes.
	for (const lang of ['ko', 'en']) {
		const navPath = path.join(CACHE_DIR, bookId, lang, '_nav.json');
		const titlePath = path.join(CACHE_DIR, bookId, lang, '_title.txt');
		await fs.unlink(navPath).catch(() => {});
		await fs.unlink(titlePath).catch(() => {});
	}

	// Re-translate in background sequentially — unchanged pages will be skipped
	preTranslateBook(bookId, 'ko')
		.then(() => preTranslateBook(bookId, 'en'))
		.catch(console.error);
}
