<script lang="ts">
	import { t } from '$lib/i18n';
	import ChatMessage from './ChatMessage.svelte';
	import ChatInput from './ChatInput.svelte';
	import { chatbotMessages } from '$lib/stores/chatbot';

	let { bookId, bookName, isVisible, onToggle } = $props<{
		bookId: string;
		bookName: string;
		isVisible: boolean;
		onToggle: () => void;
	}>();

	// Get messages from store for this book
	let messages = $derived($chatbotMessages[bookId] || []);
	let isLoading = $state(false);

	async function sendMessage(content: string) {
		if (!content.trim() || isLoading) return;

		// Add user message
		const newMessages = [...messages, { role: 'user' as const, content }];
		chatbotMessages.update((state) => ({
			...state,
			[bookId]: newMessages
		}));
		isLoading = true;

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bookId,
					messages: newMessages
				})
			});

			if (!response.ok) {
				throw new Error('Failed to send message');
			}

			const data = await response.json();
			chatbotMessages.update((state) => ({
				...state,
				[bookId]: [...newMessages, { role: 'assistant' as const, content: data.message }]
			}));
		} catch (error) {
			console.error('Chat error:', error);
			chatbotMessages.update((state) => ({
				...state,
				[bookId]: [...newMessages, {
					role: 'assistant' as const,
					content: 'Sorry, I encountered an error. Please try again.'
				}]
			}));
		} finally {
			isLoading = false;
		}
	}

	function clearChat() {
		chatbotMessages.update((state) => ({
			...state,
			[bookId]: []
		}));
	}
</script>

{#if isVisible}
	<div class="chatbot">
		<div class="chatbot-header">
			<div class="chatbot-title">
				<span class="chatbot-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
					</svg>
				</span>
				<span>{$t('chatbot.title')}</span>
			</div>
			<div class="chatbot-actions">
				<button class="btn-icon" onclick={clearChat} title="Clear chat">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="3 6 5 6 21 6"></polyline>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
					</svg>
				</button>
				<button class="btn-icon" onclick={onToggle} title="Hide chat">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
		</div>

		<div class="chatbot-messages">
			{#if messages.length === 0}
				<div class="chatbot-empty">
					<p>{$t('chatbot.welcome')}</p>
					<p class="chatbot-hint">{$t('chatbot.hint')}</p>
				</div>
			{:else}
				{#each messages as message}
					<ChatMessage role={message.role} content={message.content} />
				{/each}
				{#if isLoading}
					<ChatMessage role="assistant" content="..." isLoading={true} />
				{/if}
			{/if}
		</div>

		<ChatInput onSend={sendMessage} disabled={isLoading} />
	</div>
{:else}
	<button class="chatbot-toggle" onclick={onToggle} title="Show AI Assistant">
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<!-- Chat bubble -->
			<path d="M14 4h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1l-2 2v-2h-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
			<!-- Robot head -->
			<rect x="4" y="14" width="10" height="8" rx="1"/>
			<!-- Antenna -->
			<line x1="9" y1="12" x2="9" y2="14"/>
			<circle cx="9" cy="11.5" r="0.5" fill="currentColor"/>
			<!-- Eyes -->
			<circle cx="7" cy="17" r="0.7" fill="currentColor"/>
			<circle cx="11" cy="17" r="0.7" fill="currentColor"/>
			<!-- Mouth -->
			<line x1="7" y1="19.5" x2="11" y2="19.5" stroke-linecap="round"/>
		</svg>
	</button>
{/if}

<style>
	.chatbot {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: white;
		border-left: 1px solid var(--border-color);
	}

	.chatbot-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border-color);
		background: var(--bg-gray);
		flex-shrink: 0;
	}

	.chatbot-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.chatbot-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chatbot-actions {
		display: flex;
		gap: 0.25rem;
	}

	.btn-icon {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		opacity: 0.6;
		transition: opacity 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
	}

	.btn-icon:hover {
		opacity: 1;
		color: var(--text-primary);
	}

	.chatbot-messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.chatbot-empty {
		text-align: center;
		padding: 1.5rem 0.75rem;
		color: var(--text-secondary);
	}

	.chatbot-empty p {
		margin: 0 0 0.4rem 0;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.chatbot-hint {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.chatbot-toggle {
		position: fixed;
		bottom: 85px;
		right: 2.5rem;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: #e8f2fc;
		color: #3b82f6;
		border: 2px solid #bdd7f0;
		cursor: pointer;
		font-size: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		transition: all 0.2s;
		z-index: 1001;
	}

	.chatbot-toggle:hover {
		transform: scale(1.1);
		border-color: #93c5fd;
		background: #f0f7ff;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
	}

	@media (max-width: 1280px) {
		.chatbot {
			border-left: none;
			border-top: 1px solid var(--border-color);
		}

		.chatbot-toggle {
			bottom: 85px;
			right: 2.5rem;
		}
	}
</style>
