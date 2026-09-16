import type { RequestHandler } from './$types';
import { parseSummary, getBookRoot, type NavItem } from '$lib/server/summary-parser';
import { callLLMStream, type LLMMessage } from '$lib/server/llm';
import { bookExists, safeJoin } from '$lib/server/books';
import { readFile } from 'fs/promises';

// Limits for this unauthenticated endpoint
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

const MAX_ITERATIONS = 5;
const MAX_FILE_CHARS = 60_000;
const INTRO_PRELOAD_CHARS = 12_000;
const READ_LINE_RE = /^READ\s*:\s*(.+?)\s*$/i;

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const bookId = body?.bookId;

		if (!(await bookExists(bookId))) {
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

		const navigation = await parseSummary(bookId);
		const bookRoot = await getBookRoot(bookId);
		const navText = formatNavigation(navigation);
		const introText = await loadIntroduction(bookRoot);

		const systemPrompt = buildSystemPrompt(navText, bookRoot, introText);
		const conv: LLMMessage[] = [{ role: 'system', content: systemPrompt }, ...history];

		const userQ = history[history.length - 1].content.slice(0, 80);
		console.log(`[chat] bookId=${bookId} q="${userQ}"`);

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				const emit = (payload: Record<string, unknown>) =>
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
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
					let answered = false;
					for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
						status('thinking');
						const result = await streamIteration(conv, send, reset);
						if (result.kind === 'answer') {
							console.log(`[chat] iter=${iter} ANSWER (${result.raw.length} chars)`);
							answered = true;
							break;
						}
						console.log(`[chat] iter=${iter} READ ${result.path}`);
						status('reading', result.path);
						conv.push({ role: 'assistant', content: result.raw });
						const toolResult = await runReadTool(bookRoot, result.path);
						console.log(
							`[chat] iter=${iter} tool result preview: ${toolResult.slice(0, 80).replace(/\n/g, ' ⏎ ')}`
						);
						conv.push({ role: 'user', content: toolResult });
					}
					if (!answered) {
						console.log('[chat] BUDGET EXHAUSTED');
						send(
							'I could not finish researching this within my search budget. Please try a more specific question or point me at a chapter.'
						);
					}
				} catch (err) {
					console.error('[chat] stream error:', err);
					const msg = err instanceof Error ? err.message : String(err);
					send(`\n\n[error: ${msg}]`);
				} finally {
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
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
 * Run one LLM iteration, streaming the answer to the client as it is produced.
 *
 * A response is either a tool call (`READ: <path>` as the last non-blank line)
 * or a final answer, and we cannot know which until it ends. So we stream
 * optimistically while withholding anything that could still turn into a tool
 * call: nothing goes out until the first non-blank line proves not to be a READ,
 * and a completed READ line (plus trailing blanks) is held back in case it is
 * the last one. If the model writes prose and *then* calls a tool, the client is
 * told to discard what it has shown.
 *
 * The tool-vs-answer verdict is always taken from the complete response, so it
 * matches what a fully buffered read would have concluded.
 */
async function streamIteration(
	conv: LLMMessage[],
	send: (text: string) => void,
	reset: () => void
): Promise<{ kind: 'tool'; path: string; raw: string } | { kind: 'answer'; raw: string }> {
	const stream = await callLLMStream(conv, { maxTokens: 2048, temperature: 0.3 });
	const think = createThinkStripper();

	let raw = ''; // everything the model sent, verbatim
	let cleaned = ''; // with <think> blocks removed
	let mode: 'undecided' | 'answer' | 'tool' = 'undecided';
	let held = ''; // completed lines withheld pending the READ check
	let line = ''; // current incomplete line
	let lineSent = 0; // how much of `line` already went out
	let emitted = false;

	const emit = (text: string) => {
		if (!text) return;
		emitted = true;
		send(text);
	};

	const handleCompleteLine = (full: string) => {
		const trimmed = full.trim();
		if (mode === 'undecided') {
			if (!trimmed) {
				return; // drop leading blank lines
			}
			if (READ_LINE_RE.test(trimmed)) {
				mode = 'tool';
				held = '';
				return;
			}
			mode = 'answer';
		}
		if (mode === 'tool') return;
		// The line break is withheld with the next line, so an answer never ends
		// on a dangling newline.
		const newline = full.endsWith('\n') ? '\n' : '';
		const text = full.slice(0, full.length - newline.length);
		if (lineSent > 0) {
			// Part of this line is already on the wire, so it cannot be withheld.
			emit(held + text.slice(lineSent));
			held = newline;
			return;
		}
		if (!trimmed || READ_LINE_RE.test(trimmed)) {
			held += full;
			return;
		}
		emit(held + text);
		held = newline;
	};

	const streamPartial = () => {
		if (mode === 'tool' || lineSent >= line.length) return;
		// A blank or still-READ-shaped partial line stays back until it grows.
		if (lineSent === 0 && couldStartReadLine(line)) return;
		if (mode === 'undecided') {
			// The first line can no longer become a tool call: start streaming.
			mode = 'answer';
			held = '';
		}
		emit(held + line.slice(lineSent));
		held = '';
		lineSent = line.length;
	};

	const consume = (text: string) => {
		cleaned += text;
		line += text;
		let nl: number;
		while ((nl = line.indexOf('\n')) !== -1) {
			const full = line.slice(0, nl + 1);
			line = line.slice(nl + 1);
			handleCompleteLine(full);
			lineSent = 0;
		}
		streamPartial();
	};

	for await (const chunk of stream) {
		const piece = chunk.choices?.[0]?.delta?.content;
		if (!piece) continue;
		raw += piece;
		const text = think.feed(piece);
		if (text) consume(text);
	}
	const tail = think.flush();
	if (tail) consume(tail);

	const toolPath = detectToolCall(cleaned);
	if (toolPath !== null) {
		if (emitted) reset();
		return { kind: 'tool', path: toolPath, raw };
	}

	emit((held + line.slice(lineSent)).replace(/\s+$/, ''));
	return { kind: 'answer', raw: cleaned.trim() };
}

/** Returns the requested path if the response ends with a `READ:` line. */
function detectToolCall(cleaned: string): string | null {
	const lines = cleaned.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const trimmed = lines[i].trim();
		if (!trimmed) continue;
		const m = trimmed.match(READ_LINE_RE);
		return m ? m[1].replace(/^["'`]|["'`]$/g, '') : null;
	}
	return null;
}

/** True while a partial line could still grow into a `READ:` tool call. */
function couldStartReadLine(partial: string): boolean {
	const t = partial.trimStart().toLowerCase();
	return 'read:'.startsWith(t.slice(0, 5));
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/**
 * Strips `<think>...</think>` blocks from a token stream, holding back any
 * trailing text that could be the start of a tag split across chunks.
 */
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

async function loadIntroduction(bookRoot: string): Promise<string> {
	for (const name of ['README.md', 'introduction.md', 'intro.md']) {
		try {
			const filePath = safeJoin(bookRoot, name);
			if (!filePath) continue;
			const content = await readFile(filePath, 'utf-8');
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

function buildSystemPrompt(navText: string, bookRoot: string, introText: string): string {
	const introSection = introText
		? `\nBOOK INTRODUCTION (already loaded — answer authorship, overview, and "what is this book" questions directly from this without calling READ):\n${introText}\n`
		: '';

	return `You are a helpful tutor for a specific textbook. Your job is to ANSWER the user's question directly, using the contents of the book — not to redirect the user to a chapter.

BOOK FILES LIVE AT: ${bookRoot}${introSection}
All paths in the table of contents below are RELATIVE to that directory. The READ tool resolves them automatically — you only pass the relative path shown in the TOC.

YOU HAVE A TOOL: READ
To request the contents of a chapter, output ONE line and nothing else:
  READ: <path>
The system will reply with the file contents. You may then call READ again or write your final answer.

HOW YOU MUST BEHAVE
1. For ANY substantive question (concept, fact, "explain X", "who wrote this", "how does Y work"): you MUST call READ on the most relevant chapter(s) BEFORE answering. Don't guess from chapter titles alone.
2. Read more than one chapter if the answer might span several. Read up to 3–4 chapters as needed. Keep going until you can answer concretely.
3. Once you have the information, write a direct, substantive answer that actually contains the answer — facts, names, code, explanations — drawn from the chapter you read. Do NOT respond with "you should read chapter X" or "more details are in the Y section". The user came to YOU because they don't want to hunt through the book.
4. At the end of your answer (not instead of it), you may add a short "참고:" / "See also:" line linking to the chapter you used: [Section Title](path/to/file.md).
5. Match the user's language. If they wrote in Korean, answer in Korean. If English, English.
6. Only answer without using READ for pure small-talk ("hi", "thanks") or when the user asks about something clearly outside the book.

OUTPUT FORMAT
- A tool call must be your ENTIRE response for that turn — JUST the line "READ: <path>", no prose, no quotes, no code fence.
- A final answer is plain Markdown.

CHOOSING THE PATH
- The path MUST be copied verbatim from the TABLE OF CONTENTS below — pick the matching entry.
- Do NOT invent paths or add directory prefixes that aren't shown. If the TOC says "functions.md", write exactly that — not "chapters/functions.md".
- If a READ comes back with [error ...], pick a DIFFERENT path from the TOC, do not retry the same one.

PATTERN OF A FULL TURN
turn 1 (your tool call, must be only one line, exactly):
READ: <one path copied from the TOC below>
turn 2 (after system returns file contents): a real, substantive Markdown answer that contains the answer, ending with one short link line: 참고: [Section Title](<the same path>)

NEVER OUTPUT (these are bad — they redirect instead of answering):
- "더 자세히 알고 싶으시다면 ~~ 챕터를 읽어보세요"
- "~~에 대한 정보는 ~~ 섹션에서 확인할 수 있습니다"
Always READ the chapter yourself and tell the user the actual content.

TABLE OF CONTENTS (from SUMMARY.md) — these are the ONLY paths you may pass to READ:
${navText}`;
}

function formatNavigation(items: NavItem[], level = 0): string {
	let out = '';
	for (const item of items) {
		const indent = '  '.repeat(level);
		const title = item.title === '__INTRODUCTION__' ? 'Introduction (README)' : item.title;
		if (item.isHeader) {
			out += `${indent}# ${title}\n`;
			if (item.children) out += formatNavigation(item.children, level);
		} else if (item.path) {
			out += `${indent}- ${title} → ${item.path}\n`;
			if (item.children) out += formatNavigation(item.children, level + 1);
		} else if (item.children) {
			out += `${indent}- ${title}\n`;
			out += formatNavigation(item.children, level + 1);
		}
	}
	return out;
}

async function runReadTool(bookRoot: string, requested: string): Promise<string> {
	const filePath = requested ? safeJoin(bookRoot, requested) : null;
	if (!filePath) {
		return `[error: invalid path "${requested}". Pick a path verbatim from the TABLE OF CONTENTS and try a DIFFERENT one.]`;
	}
	try {
		const content = await readFile(filePath, 'utf-8');
		const truncated =
			content.length > MAX_FILE_CHARS
				? content.slice(0, MAX_FILE_CHARS) + '\n\n…[truncated]'
				: content;
		return `[chapter: ${requested}]\n\n${truncated}`;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return `[error reading "${requested}": ${msg}. The path is wrong. Look at the TABLE OF CONTENTS in the system prompt and copy a path EXACTLY as shown there. Then either issue READ with the correct path, or write your final answer.]`;
	}
}
