import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Message = {
	role: 'user' | 'assistant';
	content: string;
};

type ChatbotState = {
	[bookId: string]: Message[];
};

// Load from sessionStorage if available
function loadState(): ChatbotState {
	if (browser) {
		const stored = sessionStorage.getItem('chatbot-state');
		if (stored) {
			try {
				return JSON.parse(stored);
			} catch {
				return {};
			}
		}
	}
	return {};
}

export const chatbotMessages = writable<ChatbotState>(loadState());

// Save to sessionStorage on changes
if (browser) {
	chatbotMessages.subscribe((state) => {
		sessionStorage.setItem('chatbot-state', JSON.stringify(state));
	});
}

export function getChatMessages(bookId: string): Message[] {
	let messages: Message[] = [];
	chatbotMessages.subscribe((state) => {
		messages = state[bookId] || [];
	})();
	return messages;
}

export function setChatMessages(bookId: string, messages: Message[]) {
	chatbotMessages.update((state) => ({
		...state,
		[bookId]: messages
	}));
}

export function clearChatMessages(bookId: string) {
	chatbotMessages.update((state) => ({
		...state,
		[bookId]: []
	}));
}
