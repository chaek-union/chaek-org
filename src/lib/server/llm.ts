import { env } from '$env/dynamic/private';
import { OpenRouter } from '@openrouter/sdk';
import { TooManyRequestsResponseError } from '@openrouter/sdk/models/errors';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	maxTokens?: number;
	temperature?: number;
}

function getClient() {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY not configured in environment variables');
	}
	return new OpenRouter({ apiKey });
}

function getModel() {
	return env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
}

export async function callLLM(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<string> {
	try {
		const client = getClient();
		const response = await client.chat.send({
			httpReferer: 'https://chaek.org',
			xTitle: 'Chaek Textbook Platform',
			chatGenerationParams: {
				model: getModel(),
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				maxTokens: options.maxTokens,
				temperature: options.temperature,
				stream: false
			}
		});

		if (!response.choices?.[0]?.message) {
			throw new Error('Invalid response from OpenRouter');
		}

		return response.choices[0].message.content as string;
	} catch (error) {
		if (error instanceof TooManyRequestsResponseError) {
			throw new Error('rate-limited');
		}
		throw error;
	}
}

export async function callLLMStream(
	messages: LLMMessage[],
	options: LLMOptions = {}
) {
	try {
		const client = getClient();
		const stream = await client.chat.send({
			httpReferer: 'https://chaek.org',
			xTitle: 'Chaek Textbook Platform',
			chatGenerationParams: {
				model: getModel(),
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				maxTokens: options.maxTokens,
				temperature: options.temperature,
				stream: true
			}
		});

		return stream;
	} catch (error) {
		if (error instanceof TooManyRequestsResponseError) {
			throw new Error('rate-limited');
		}
		throw error;
	}
}
