<script lang="ts">
	import { t } from '$lib/i18n';

	let { onSend, disabled = false } = $props<{
		onSend: (message: string) => void;
		disabled?: boolean;
	}>();

	let input = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (input.trim() && !disabled) {
			onSend(input.trim());
			input = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	}
</script>

<form class="chat-input" onsubmit={handleSubmit}>
	<textarea
		bind:value={input}
		onkeydown={handleKeydown}
		placeholder={$t('chatbot.placeholder')}
		{disabled}
		rows="1"
	></textarea>
	<button type="submit" disabled={disabled || !input.trim()} class="btn-send">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>
</form>

<style>
	.chat-input {
		display: flex;
		gap: 0.4rem;
		padding: 0.75rem;
		border-top: 1px solid var(--border-color);
		background: white;
		flex-shrink: 0;
	}

	textarea {
		flex: 1;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		font-family: inherit;
		font-size: 0.85rem;
		resize: none;
		min-height: 2rem;
		max-height: 6rem;
		transition: border-color 0.2s;
	}

	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea:disabled {
		background: var(--bg-gray);
		cursor: not-allowed;
	}

	.btn-send {
		width: 2rem;
		height: 2rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
		flex-shrink: 0;
		align-self: flex-end;
	}

	.btn-send:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-send:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
