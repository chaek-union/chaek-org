<script lang="ts">
	import { goto } from '$app/navigation';

	let { role, content, isLoading = false } = $props<{
		role: 'user' | 'assistant';
		content: string;
		isLoading?: boolean;
	}>();

	// Convert markdown links to HTML with click handlers
	function renderContent(text: string): string {
		// Convert [text](path) to clickable links
		return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
			return `<a href="#" data-path="${linkPath}" class="section-link">${linkText}</a>`;
		});
	}

	function handleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.classList.contains('section-link')) {
			e.preventDefault();
			const path = target.getAttribute('data-path');
			if (path) {
				// Navigate to the section
				const bookId = window.location.pathname.split('/')[2];
				goto(`/books/${bookId}/${path.replace(/^\//, '')}`);
			}
		}
	}
</script>

<div class="message message-{role}">
	<div class="message-content" onclick={handleClick}>
		{#if isLoading}
			<div class="message-loading">
				<span class="dot"></span>
				<span class="dot"></span>
				<span class="dot"></span>
			</div>
		{:else}
			{@html renderContent(content)}
		{/if}
	</div>
</div>

<style>
	.message {
		display: flex;
		align-items: flex-start;
	}

	.message-user {
		justify-content: flex-end;
	}

	.message-content {
		background: var(--bg-gray);
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		max-width: 80%;
		word-wrap: break-word;
		line-height: 1.5;
		font-size: 0.85rem;
	}

	.message-content :global(.section-link) {
		color: var(--color-primary);
		text-decoration: underline;
		cursor: pointer;
		font-weight: 500;
	}

	.message-content :global(.section-link:hover) {
		color: var(--color-primary-hover);
	}

	.message-user .message-content {
		background: var(--color-primary);
		color: white;
	}

	.message-user .message-content :global(.section-link) {
		color: white;
		text-decoration: underline;
	}

	.message-loading {
		display: flex;
		gap: 0.25rem;
	}

	.dot {
		width: 0.4rem;
		height: 0.4rem;
		background: var(--text-secondary);
		border-radius: 50%;
		animation: pulse 1.4s ease-in-out infinite;
	}

	.dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%, 60%, 100% {
			opacity: 0.3;
			transform: scale(1);
		}
		30% {
			opacity: 1;
			transform: scale(1.1);
		}
	}
</style>
