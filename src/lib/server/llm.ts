import { env } from '$env/dynamic/private';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	maxTokens?: number;
	temperature?: number;
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

export async function callLLM(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<string> {
	const model = await getModel();
	const baseUrl = getBaseUrl();

	const response = await fetch(`${baseUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			max_tokens: options.maxTokens ?? 2048,
			temperature: options.temperature ?? 0.7,
			stream: false
		}),
		signal: AbortSignal.timeout(VLLM_TIMEOUT_MS)
	});

	if (response.status === 429) {
		throw new Error('rate-limited');
	}
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`vLLM API error ${response.status}: ${errorText}`);
	}

	const data = await response.json();
	return data.choices[0].message.content;
}

export async function callLLMStream(
	messages: LLMMessage[],
	options: LLMOptions = {}
) {
	const model = await getModel();
	const baseUrl = getBaseUrl();

	const response = await fetch(`${baseUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			max_tokens: options.maxTokens ?? 2048,
			temperature: options.temperature ?? 0.7,
			stream: true
		}),
		signal: AbortSignal.timeout(VLLM_TIMEOUT_MS)
	});

	if (response.status === 429) {
		throw new Error('rate-limited');
	}
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`vLLM API error ${response.status}: ${errorText}`);
	}

	return parseSSEStream(response);
}

async function* parseSSEStream(response: Response) {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith('data: ')) continue;
				const data = trimmed.slice(6);
				if (data === '[DONE]') return;

				try {
					yield JSON.parse(data);
				} catch {
					// skip malformed chunks
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
