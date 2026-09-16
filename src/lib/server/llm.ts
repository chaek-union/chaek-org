import { env } from '$env/dynamic/private';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
}

export interface LLMStreamChunk {
	choices?: Array<{ delta?: { content?: string } }>;
}

const VLLM_TIMEOUT_MS = 120_000;

function getBaseUrl(): string {
	return env.VLLM_BASE_URL || 'http://10.125.208.42:9241';
}

let cachedModel: string | null = null;

async function resolveModel(): Promise<string> {
	if (env.VLLM_MODEL) return env.VLLM_MODEL;

	const response = await fetch(`${getBaseUrl()}/v1/models`);
	if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);
	const data = await response.json();
	const id = data?.data?.[0]?.id;
	if (!id) throw new Error('No models available on vLLM server');
	return id;
}

async function getModel(): Promise<string> {
	if (!cachedModel) cachedModel = await resolveModel();
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
	const signals: AbortSignal[] = [AbortSignal.timeout(VLLM_TIMEOUT_MS)];
	if (options.signal) signals.push(options.signal);

	const send = async (model: string) =>
		fetch(`${getBaseUrl()}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				max_tokens: options.maxTokens ?? 2048,
				temperature: options.temperature ?? 0.7,
				stream
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
				throw new Error(`vLLM API error ${response.status}: ${await response.text()}`);
			}
		} else {
			throw new Error(`vLLM API error ${response.status}: ${errorText}`);
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
