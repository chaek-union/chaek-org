import type { RequestHandler } from './$types';
import { parseSummary, getBookRoot, type NavItem } from '$lib/server/summary-parser';
import { callLLMStream, type LLMMessage } from '$lib/server/llm';
import { retrieveContext } from '$lib/server/retrieval';
import { bookExists } from '$lib/server/books';
import { getBookAccess } from '$lib/server/book-access';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Limits for this unauthenticated endpoint
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

// Retrieval budget: enough context to answer from, small enough to prefill
// quickly. The passages replace the old read-a-whole-chapter tool loop.
const RETRIEVAL_MAX_CHARS = 9_000;
const RETRIEVAL_TOP_K = 8;
const INTRO_PRELOAD_CHARS = 4_000;
// Title and byline are short, always relevant, and phrased differently from the
// questions people ask about them ("who wrote this" vs "저자:"), so keyword
// retrieval misses them. Carry them in every prompt instead.
const BOOK_HEADER_CHARS = 700;

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const bookId = body?.bookId;

		if (!(await bookExists(bookId)) || (await getBookAccess(bookId, locals)) === 'denied') {
			return jsonError('Book not found', 404);
		}
		if (!Array.isArray(body.messages)) {
			return jsonError('Invalid messages', 400);
		}

		// Only keep user/assistant turns, capped in count and length
		const history: LLMMessage[] = body.messages
			.filter(
				(m: any) =>
					(m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string'
			)
			.slice(-MAX_MESSAGES)
			.map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

		if (history.length === 0 || history[history.length - 1].role !== 'user') {
			return jsonError('Invalid messages', 400);
		}

		const bookRoot = await getBookRoot(bookId);
		const question = history[history.length - 1]?.content ?? '';

		// Retrieve before generating: the model gets the relevant passages up
		// front instead of spending a round trip per chapter to find them.
		const t0 = Date.now();
		const retrieved = await retrieveContext(bookId, question, {
			maxChars: RETRIEVAL_MAX_CHARS,
			topK: RETRIEVAL_TOP_K
		});
		const retrievalMs = Date.now() - t0;

		const bookHeader = await loadBookHeader(bookRoot);
		const introText = retrieved.chunkCount ? '' : await loadIntroduction(bookRoot);
		const systemPrompt = buildSystemPrompt(retrieved.text, introText, bookHeader);
		const conv: LLMMessage[] = [{ role: 'system', content: systemPrompt }, ...history];

		console.log(
			`[chat] bookId=${bookId} q="${question.slice(0, 80)}" ` +
				`retrieved ${retrieved.chunkCount} chunks / ${retrieved.charCount} chars in ${retrievalMs}ms`
		);

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				let closed = false;
				const emit = (payload: Record<string, unknown>) => {
					if (closed) return;
					try {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
					} catch {
						// The client went away mid-answer; stop writing to the stream.
						closed = true;
					}
				};
				const send = (text: string) => {
					if (!text) return;
					emit({ content: text });
				};
				// Tells the client to discard the partial answer shown so far,
				// used when a streamed preamble turns out to precede a tool call.
				const reset = () => emit({ reset: true });
				const status = (state: 'reading' | 'thinking', path?: string) =>
					emit({ status: state, path });

				try {
					if (retrieved.chunkCount) status('reading', retrieved.sources[0]?.path);
					status('thinking');
					const chars = await streamAnswer(conv, send);
					console.log(`[chat] ANSWER (${chars} chars)`);
				} catch (err) {
					console.error('[chat] stream error:', err);
					const msg = err instanceof Error ? err.message : String(err);
					send(`\n\n[error: ${msg}]`);
				} finally {
					if (!closed) {
						try {
							controller.enqueue(encoder.encode('data: [DONE]\n\n'));
							controller.close();
						} catch {
							/* already closed by the client */
						}
					}
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				// Disable proxy buffering so chunks reach the browser immediately.
				'X-Accel-Buffering': 'no'
			}
		});
	} catch (error) {
		console.error('Chat API error:', error);
		const message = error instanceof Error ? error.message : String(error);
		return message === 'rate-limited'
			? jsonError('rate-limited', 429)
			: jsonError('Internal server error', 500);
	}
};

/**
 * Stream one grounded answer to the client, stripping <think> blocks as they go.
 *
 * There is no tool loop any more: the relevant passages are already in the
 * system prompt, so the first response is the answer and every token can go
 * straight to the browser.
 */
async function streamAnswer(conv: LLMMessage[], send: (text: string) => void): Promise<number> {
	const stream = await callLLMStream(conv, {
		maxTokens: 1536,
		temperature: 0.3,
		// Grounded answers do not need a separate reasoning pass, and skipping
		// it is the largest latency saving available here.
		thinking: 'off'
	});
	const think = createThinkStripper();

	let sent = 0;
	let pending = ''; // trailing whitespace held back so the answer ends clean
	const emit = (text: string) => {
		if (!text) return;
		const combined = pending + text;
		const trail = /\s+$/.exec(combined);
		const body = trail ? combined.slice(0, combined.length - trail[0].length) : combined;
		pending = trail ? trail[0] : '';
		if (body) {
			send(body);
			sent += body.length;
		}
	};

	for await (const chunk of stream) {
		const piece = chunk.choices?.[0]?.delta?.content;
		if (!piece) continue;
		emit(think.feed(piece));
	}
	emit(think.flush());
	return sent;
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

function createThinkStripper() {
	let carry = '';
	let inThink = false;

	return {
		feed(chunk: string): string {
			carry += chunk;
			let out = '';
			for (;;) {
				if (inThink) {
					const end = carry.indexOf(THINK_CLOSE);
					if (end === -1) {
						carry = carry.slice(carry.length - partialTagLen(carry, THINK_CLOSE));
						return out;
					}
					carry = carry.slice(end + THINK_CLOSE.length);
					inThink = false;
				} else {
					const start = carry.indexOf(THINK_OPEN);
					if (start === -1) {
						const keep = partialTagLen(carry, THINK_OPEN);
						out += carry.slice(0, carry.length - keep);
						carry = carry.slice(carry.length - keep);
						return out;
					}
					out += carry.slice(0, start);
					carry = carry.slice(start + THINK_OPEN.length);
					inThink = true;
				}
			}
		},
		flush(): string {
			const rest = inThink ? '' : carry;
			carry = '';
			return rest;
		}
	};
}

/** Length of the longest suffix of `s` that is a proper prefix of `tag`. */
function partialTagLen(s: string, tag: string): number {
	for (let n = Math.min(s.length, tag.length - 1); n > 0; n--) {
		if (s.endsWith(tag.slice(0, n))) return n;
	}
	return 0;
}

/** Title plus the opening lines of the README, where the byline normally sits. */
async function loadBookHeader(bookRoot: string): Promise<string> {
	let title = '';
	try {
		const meta = JSON.parse(await readFile(join(bookRoot, 'book.json'), 'utf-8'));
		if (typeof meta.title === 'string') title = meta.title;
	} catch {
		/* no book.json */
	}

	let opening = '';
	try {
		const readme = await readFile(join(bookRoot, 'README.md'), 'utf-8');
		opening = readme
			.split('\n')
			.filter((l) => !/^\s*<|^\s*!\[|^\s*$/.test(l)) // drop html, images, blanks
			.slice(0, 12)
			.join('\n')
			.slice(0, BOOK_HEADER_CHARS);
	} catch {
		/* no README */
	}

	if (!title && !opening) return '';
	return `BOOK: ${title || '(untitled)'}\n${opening}`.trim();
}

async function loadIntroduction(bookRoot: string): Promise<string> {
	for (const name of ['README.md', 'introduction.md', 'intro.md']) {
		try {
			const content = await readFile(join(bookRoot, name), 'utf-8');
			const truncated =
				content.length > INTRO_PRELOAD_CHARS
					? content.slice(0, INTRO_PRELOAD_CHARS) + '\n\n…[truncated]'
					: content;
			return `[${name}]\n\n${truncated}`;
		} catch {
			/* try next */
		}
	}
	return '';
}

function buildSystemPrompt(contextText: string, introText: string, bookHeader: string): string {
	const header = bookHeader ? `\n\n${bookHeader}\n` : '';

	if (!contextText) {
		const intro = introText ? `\n\nBOOK INTRODUCTION:\n${introText}` : '';
		return `You are a helpful tutor for a specific textbook.${header}

Nothing else in the book matched this question. Answer from the book details above or the introduction below if they cover it; otherwise say you could not find it in the book and ask the user to rephrase or name a chapter. Match the user's language.${intro}`;
	}

	return `You are a helpful tutor for a specific textbook. Answer the user's question directly, using the book details and passages below — do not redirect the user to a chapter.${header}

HOW TO ANSWER
1. Answer from the passages: give the facts, names, code, and explanations they contain.
2. Never reply with "see chapter X" or "more details are in section Y" instead of an answer. The user came to you so they do not have to hunt through the book.
3. If the passages do not contain the answer, say so plainly rather than inventing one.
4. End with one short source line: 참고: [Section Title](path/to/file.md) — use a path exactly as given in a passage header below.
5. Match the user's language. Korean question, Korean answer.
6. Write plain Markdown.

PASSAGES FROM THE BOOK (each header gives the file path and heading):

${contextText}`;
}


