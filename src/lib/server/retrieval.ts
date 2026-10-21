/**
 * Keyword retrieval over book chunks, with a small link graph for expansion.
 *
 * Why not embeddings: the win here comes from sending a few thousand tokens of
 * relevant text instead of whole chapters, not from finer-grained ranking. This
 * index needs no model, builds in about a second per book, and is cached on disk.
 *
 * Scoring is BM25 over CJK bigrams plus latin word tokens (no dictionary needed
 * for Korean), then one hop of graph expansion: a chunk's neighbours are its
 * siblings under the same heading, the chunks before/after it in the same file,
 * and any chunk whose file it links to. Neighbours inherit a decayed score, so a
 * question answered across two adjacent sections still pulls both in.
 */
import { readFile, readdir, stat, mkdir, writeFile } from 'fs/promises';
import { join, relative, dirname, normalize } from 'path';
import { getBookRoot } from './summary-parser';
import { detectBookLanguage } from './translate';
import { callLLM } from './llm';

const CACHE_DIR = 'data/chat-index';
const CHUNK_TARGET_CHARS = 1_200;
const CHUNK_MAX_CHARS = 2_000;
const NEIGHBOUR_DECAY = 0.35;
const QUERY_CACHE_FILE = 'query-terms.json';
const K1 = 1.4;
const B = 0.75;

export interface Chunk {
	id: number;
	path: string; // relative to book root
	heading: string; // "Chapter 3 › Splicing regulation"
	text: string;
	len: number; // token count of the tokenised text, for BM25
	terms: Record<string, number>;
	links: string[]; // paths this chunk links to
}

interface BookIndex {
	builtAt: number;
	signature: string; // mtime+size of every source file
	chunks: Chunk[];
	df: Record<string, number>;
	avgLen: number;
	byPath: Record<string, number[]>; // path -> chunk ids, in document order
}

const memoryCache = new Map<string, BookIndex>();

/** CJK bigrams + latin/number words, lowercased. */
export function tokenize(text: string): string[] {
	const out: string[] = [];
	const cjk = /[ㄱ-ㆎ가-힣一-鿿぀-ヿ]/;
	let run = '';
	const flushCjk = () => {
		if (run.length === 1) out.push(run);
		for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
		run = '';
	};
	for (const ch of text.toLowerCase()) {
		if (cjk.test(ch)) {
			run += ch;
		} else {
			if (run) flushCjk();
			if (/[a-z0-9_]/.test(ch)) {
				out.push(ch);
			} else {
				out.push(' ');
			}
		}
	}
	if (run) flushCjk();
	// Re-join the latin run, which was pushed char by char above.
	const merged: string[] = [];
	let word = '';
	for (const t of out) {
		if (t === ' ') {
			if (word.length > 1) merged.push(word);
			word = '';
		} else if (t.length === 1 && /[a-z0-9_]/.test(t)) {
			word += t;
		} else {
			if (word.length > 1) merged.push(word);
			word = '';
			merged.push(t);
		}
	}
	if (word.length > 1) merged.push(word);
	return merged;
}

async function walkMarkdown(root: string): Promise<string[]> {
	const found: string[] = [];
	async function walk(dir: string) {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const full = join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name === 'assets' || e.name === '.git' || e.name === 'node_modules') continue;
				await walk(full);
			} else if (e.name.endsWith('.md')) {
				found.push(full);
			}
		}
	}
	await walk(root);
	return found.sort();
}

/** Split one file into heading-scoped chunks, carrying the heading path along. */
function chunkFile(rel: string, content: string): Omit<Chunk, 'id' | 'len' | 'terms'>[] {
	const lines = content.split('\n');
	const stack: string[] = [];
	const chunks: Omit<Chunk, 'id' | 'len' | 'terms'>[] = [];
	let buf: string[] = [];
	let heading = '';
	let inFence = false;

	const linksIn = (text: string) => {
		const out: string[] = [];
		for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s#]+\.md)[^)]*\)/g)) {
			const target = m[1];
			if (target.startsWith('http')) continue;
			out.push(normalize(join(dirname(rel), target)));
		}
		return out;
	};

	const flush = () => {
		const text = buf.join('\n').trim();
		buf = [];
		if (text.length < 40) return; // heading-only fragments carry no answer
		chunks.push({ path: rel, heading: heading || rel, text, links: linksIn(text) });
	};

	for (const line of lines) {
		if (/^```/.test(line)) inFence = !inFence;
		const h = !inFence && /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			flush();
			const level = h[1].length;
			stack.length = Math.max(0, level - 1);
			stack[level - 1] = h[2].trim();
			heading = stack.filter(Boolean).join(' › ');
			continue;
		}
		buf.push(line);
		const size = buf.join('\n').length;
		// Split long sections on a blank line so chunks stay prompt-sized.
		if (size >= CHUNK_TARGET_CHARS && line.trim() === '') flush();
		else if (size >= CHUNK_MAX_CHARS) flush();
	}
	flush();
	return chunks;
}

async function signatureOf(files: string[]): Promise<string> {
	const parts: string[] = [];
	for (const f of files) {
		const s = await stat(f);
		parts.push(`${f}:${s.mtimeMs}:${s.size}`);
	}
	return String(parts.length) + ':' + hash(parts.join('|'));
}

function hash(s: string): string {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

async function buildIndex(bookId: string, root: string): Promise<BookIndex> {
	const files = await walkMarkdown(root);
	const signature = await signatureOf(files);
	const chunks: Chunk[] = [];
	const df: Record<string, number> = {};
	const byPath: Record<string, number[]> = {};

	for (const file of files) {
		const rel = relative(root, file);
		const content = await readFile(file, 'utf-8');
		for (const c of chunkFile(rel, content)) {
			const tokens = tokenize(`${c.heading}\n${c.text}`);
			const terms: Record<string, number> = {};
			for (const t of tokens) terms[t] = (terms[t] ?? 0) + 1;
			for (const t of Object.keys(terms)) df[t] = (df[t] ?? 0) + 1;
			const id = chunks.length;
			chunks.push({ ...c, id, len: tokens.length, terms });
			(byPath[rel] ??= []).push(id);
		}
	}

	const avgLen = chunks.reduce((a, c) => a + c.len, 0) / Math.max(chunks.length, 1);
	const index: BookIndex = { builtAt: Date.now(), signature, chunks, df, avgLen, byPath };

	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(join(CACHE_DIR, `${bookId}.json`), JSON.stringify(index), 'utf-8');
	console.log(`[retrieval] built index for ${bookId}: ${chunks.length} chunks from ${files.length} files`);
	return index;
}

async function loadIndex(bookId: string): Promise<BookIndex> {
	const root = await getBookRoot(bookId);
	const cached = memoryCache.get(bookId);
	const files = await walkMarkdown(root);
	const signature = await signatureOf(files);
	if (cached?.signature === signature) return cached;

	try {
		const raw = await readFile(join(CACHE_DIR, `${bookId}.json`), 'utf-8');
		const disk = JSON.parse(raw) as BookIndex;
		if (disk.signature === signature) {
			memoryCache.set(bookId, disk);
			return disk;
		}
	} catch {
		/* rebuild below */
	}
	const built = await buildIndex(bookId, root);
	memoryCache.set(bookId, built);
	return built;
}

function bm25(index: BookIndex, queryTerms: string[]): Map<number, number> {
	const N = index.chunks.length;
	const scores = new Map<number, number>();
	const qCount: Record<string, number> = {};
	for (const t of queryTerms) qCount[t] = (qCount[t] ?? 0) + 1;

	for (const [term, qf] of Object.entries(qCount)) {
		const df = index.df[term];
		if (!df) continue;
		if (df > N * 0.35) continue; // near-stopword for this corpus
		const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
		for (const c of index.chunks) {
			const f = c.terms[term];
			if (!f) continue;
			const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (c.len / index.avgLen)));
			scores.set(c.id, (scores.get(c.id) ?? 0) + idf * norm * Math.min(qf, 3));
		}
	}
	return scores;
}

/** One hop: file neighbours, same-heading siblings, and link targets. */
function expand(index: BookIndex, seeds: Map<number, number>, topSeeds: number[]): Map<number, number> {
	const out = new Map(seeds);
	const bump = (id: number | undefined, score: number) => {
		if (id === undefined || !index.chunks[id]) return;
		const next = (out.get(id) ?? 0) + score * NEIGHBOUR_DECAY;
		out.set(id, next);
	};
	for (const id of topSeeds) {
		const chunk = index.chunks[id];
		const score = seeds.get(id) ?? 0;
		const siblings = index.byPath[chunk.path] ?? [];
		const pos = siblings.indexOf(id);
		bump(siblings[pos - 1], score);
		bump(siblings[pos + 1], score);
		for (const sib of siblings) {
			if (sib !== id && index.chunks[sib].heading === chunk.heading) bump(sib, score * 0.8);
		}
		for (const target of chunk.links) {
			for (const linked of (index.byPath[target] ?? []).slice(0, 2)) bump(linked, score * 0.6);
		}
	}
	return out;
}

const queryTermCache = new Map<string, string>();
let queryCacheLoaded = false;

async function loadQueryCache(): Promise<void> {
	if (queryCacheLoaded) return;
	queryCacheLoaded = true;
	try {
		const raw = await readFile(join(CACHE_DIR, QUERY_CACHE_FILE), 'utf-8');
		for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
			queryTermCache.set(k, v);
		}
	} catch {
		/* first run */
	}
}

async function persistQueryCache(): Promise<void> {
	try {
		await mkdir(CACHE_DIR, { recursive: true });
		const obj = Object.fromEntries([...queryTermCache.entries()].slice(-500));
		await writeFile(join(CACHE_DIR, QUERY_CACHE_FILE), JSON.stringify(obj), 'utf-8');
	} catch {
		/* cache is best-effort */
	}
}

const hasHangul = (s: string) => /[\uac00-\ud7a3]/.test(s);

/**
 * Lexical matching scores ~zero when the question and the book are in different
 * languages, so translate the question into search terms first. The model is
 * already running for the answer itself; this call is a few dozen tokens and the
 * result is cached, so repeated questions cost nothing.
 */
async function crossLingualTerms(question: string, bookLang: 'ko' | 'en'): Promise<string> {
	const queryLang = hasHangul(question) ? 'ko' : 'en';
	if (queryLang === bookLang) return '';

	await loadQueryCache();
	const key = `${bookLang}:${question.slice(0, 200)}`;
	const cached = queryTermCache.get(key);
	if (cached !== undefined) return cached;

	const target = bookLang === 'en' ? 'English' : 'Korean';
	try {
		const out = await callLLM(
			[
				{
					role: 'system',
					content: `Translate the user's question into ${target} search keywords. Reply with 3-8 comma-separated keywords and nothing else. Include domain terms a textbook would use.`
				},
				{ role: 'user', content: question }
			],
			{ maxTokens: 64, temperature: 0, thinking: 'off' }
		);
		const terms = out.replace(/[\n\r]+/g, ' ').slice(0, 300).trim();
		queryTermCache.set(key, terms);
		void persistQueryCache();
		return terms;
	} catch (err) {
		console.warn('[retrieval] query expansion failed:', err instanceof Error ? err.message : err);
		return '';
	}
}

export interface RetrievedContext {
	text: string;
	sources: Array<{ path: string; heading: string }>;
	chunkCount: number;
	charCount: number;
}

/**
 * Retrieve a prompt-sized slice of the book for `question`.
 * Returns '' when nothing matches, which the caller treats as small-talk.
 */
export async function retrieveContext(
	bookId: string,
	question: string,
	opts: { maxChars?: number; topK?: number } = {}
): Promise<RetrievedContext> {
	const maxChars = opts.maxChars ?? 9_000;
	const topK = opts.topK ?? 8;
	const index = await loadIndex(bookId);
	if (!index.chunks.length) return { text: '', sources: [], chunkCount: 0, charCount: 0 };

	const bookLang = await detectBookLanguage(bookId).catch(() => 'en' as const);
	const extra = await crossLingualTerms(question, bookLang);
	const qTerms = tokenize(extra ? `${question} ${extra}` : question);
	const seeds = bm25(index, qTerms);
	if (!seeds.size) return { text: '', sources: [], chunkCount: 0, charCount: 0 };

	const topSeeds = [...seeds.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, Math.max(3, Math.floor(topK / 2)))
		.map(([id]) => id);

	const ranked = [...expand(index, seeds, topSeeds).entries()].sort((a, b) => b[1] - a[1]);

	const picked: Chunk[] = [];
	let chars = 0;
	for (const [id] of ranked) {
		const c = index.chunks[id];
		if (chars + c.text.length > maxChars && picked.length) continue;
		picked.push(c);
		chars += c.text.length;
		if (picked.length >= topK || chars >= maxChars) break;
	}

	// Present in reading order so the model sees a coherent narrative.
	picked.sort((a, b) => (a.path === b.path ? a.id - b.id : a.path.localeCompare(b.path)));

	const text = picked
		.map((c) => `[${c.path} — ${c.heading}]\n${c.text}`)
		.join('\n\n---\n\n');
	const seen = new Set<string>();
	const sources = picked
		.filter((c) => !seen.has(c.path) && seen.add(c.path))
		.map((c) => ({ path: c.path, heading: c.heading }));

	return { text, sources, chunkCount: picked.length, charCount: text.length };
}

/** Warm the on-disk index without answering anything (used after a book build). */
export async function ensureIndex(bookId: string): Promise<number> {
	const index = await loadIndex(bookId);
	return index.chunks.length;
}
