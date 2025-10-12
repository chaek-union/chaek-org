import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from '$env/static/private';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

export async function callLLM(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<string> {
	if (!OPENROUTER_API_KEY) {
		throw new Error('OPENROUTER_API_KEY not configured');
	}

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://chaek.org',
			'X-Title': 'Chaek Textbook Platform'
		},
		body: JSON.stringify({
			model: options.model || OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
			messages,
			max_tokens: options.maxTokens,
			temperature: options.temperature,
			reasoning: { exclude: true }
		})
	});

	if (!response.ok) {
		const errorData = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
	}

	const data = await response.json();

	if (!data.choices || !data.choices[0] || !data.choices[0].message) {
		throw new Error('Invalid response from OpenRouter');
	}

	return data.choices[0].message.content;
}
