import { env } from '$env/dynamic/private';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
	/**
	 * Reasoning budget. 'off' skips the <think> block entirely, which is much
	 * faster and is what grounded, retrieval-backed answers want; 'xhigh' suits
	 * open-ended work like translation. 'medium' is deliberately not offered:
	 * it costs noticeably more time than either neighbour for no clear gain.
	 */
	thinking?: 'off' | 'low' | 'xhigh';
	/** GBNF grammar constraining the output (llama-server extension). */
	grammar?: string;
}

export interface LLMStreamChunk {
	choices?: Array<{ delta?: { content?: string } }>;
}

const LLM_BASE_URL = env.LLM_BASE_URL || 'http://qwen-llm:8080';
const LLM_TIMEOUT_MS = 120_000;

let cachedModel: string | null = null;

async function fetchFirstModel(): Promise<string> {
	const response = await fetch(`${LLM_BASE_URL}/v1/models`);
	if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);
	const data = await response.json();
	const id = data?.data?.[0]?.id;
	if (!id) throw new Error('No models available on LLM server');
	return id;
}

async function getModel(): Promise<string> {
	if (!cachedModel) cachedModel = await fetchFirstModel();
	return cachedModel;
}

function isModelNotFoundError(status: number, errorText: string): boolean {
	if (status === 404) return true;
	const lower = errorText.toLowerCase();
	return lower.includes('model') &&
		(lower.includes('not found') ||
			lower.includes('does not exist') ||
			lower.includes('not available') ||
			lower.includes('unknown'));
}

async function chatRequest(
	messages: LLMMessage[],
	options: LLMOptions,
	stream: boolean
): Promise<Response> {
	const signals: AbortSignal[] = [AbortSignal.timeout(LLM_TIMEOUT_MS)];
	if (options.signal) signals.push(options.signal);

	const send = async (model: string) =>
		fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				temperature: options.temperature,
				max_tokens: options.maxTokens,
				stream,
				...(options.grammar ? { grammar: options.grammar } : {}),
				chat_template_kwargs:
					options.thinking === 'off'
						? { enable_thinking: false }
						: { enable_thinking: true, reasoning_effort: options.thinking ?? 'xhigh' }
			}),
			signal: AbortSignal.any(signals)
		});

	let response = await send(await getModel());

	if (response.status === 429) {
		throw new Error('rate-limited');
	}
	if (!response.ok) {
		const errorText = await response.text();
		if (isModelNotFoundError(response.status, errorText)) {
			// Server's model has changed since we last cached. Re-discover and retry once.
			cachedModel = null;
			response = await send(await getModel());
			if (!response.ok) {
				throw new Error(`LLM API error ${response.status}: ${await response.text()}`);
			}
		} else {
			throw new Error(`LLM API error ${response.status}: ${errorText}`);
		}
	}

	return response;
}

export async function callLLM(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<string> {
	const response = await chatRequest(messages, options, false);
	const data = await response.json();
	const content = data?.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw new Error('Invalid response from LLM');
	return content.trim();
}

export async function callLLMStream(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<AsyncIterable<LLMStreamChunk>> {
	const response = await chatRequest(messages, options, true);
	if (!response.body) throw new Error('No response body from LLM');
	return parseSSEStream(response.body);
}

async function* parseSSEStream(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<LLMStreamChunk> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const payload = trimmed.slice(5).trim();
			if (payload === '[DONE]') return;
			try {
				yield JSON.parse(payload) as LLMStreamChunk;
			} catch {
				/* skip malformed chunk */
			}
		}
	}
}
