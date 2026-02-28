<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { role, content, isLoading = false } = $props<{
		role: 'user' | 'assistant';
		content: string;
		isLoading?: boolean;
	}>();

	let md: any = null;

	onMount(async () => {
		const MarkdownIt = (await import('markdown-it')).default;
		md = new MarkdownIt({
			html: false,
			linkify: true,
			breaks: true
		});
	});

	const renderedHtml = $derived(() => {
		if (!content || role === 'user') return content;
		if (!md) return content;
		return md.render(content);
	});

	function handleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const link = target.closest('a');
		if (!link) return;

		const href = link.getAttribute('href');
		if (!href) return;

		// Handle internal markdown links
		if (href.endsWith('.md') && !href.startsWith('http') && !href.startsWith('//')) {
			e.preventDefault();
			const bookId = window.location.pathname.split('/')[2];
			const path = href.replace(/^\//, '').replace(/\.md$/, '');
			goto(`/books/${bookId}/${path}`);
		}
	}
</script>

<div class="message message-{role}">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="message-content" onclick={handleClick}>
		{#if isLoading}
			<div class="message-loading">
				<span class="dot"></span>
				<span class="dot"></span>
				<span class="dot"></span>
			</div>
		{:else if role === 'user'}
			{content}
		{:else}
			<div class="markdown-body">
				{@html renderedHtml()}
			</div>
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
		max-width: 85%;
		word-wrap: break-word;
		line-height: 1.5;
		font-size: 0.85rem;
	}

	.message-user .message-content {
		background: var(--color-primary);
		color: white;
	}

	/* Markdown body styles for assistant messages */
	.markdown-body :global(p) {
		margin: 0 0 0.5em 0;
	}

	.markdown-body :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown-body :global(strong) {
		font-weight: 600;
	}

	.markdown-body :global(em) {
		font-style: italic;
	}

	.markdown-body :global(code) {
		background: rgba(0, 0, 0, 0.06);
		padding: 0.15em 0.35em;
		border-radius: 3px;
		font-size: 0.85em;
		font-family: 'SFMono-Regular', Consolas, monospace;
	}

	.markdown-body :global(pre) {
		background: #f6f8fa;
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.5em 0;
	}

	.markdown-body :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.82em;
		line-height: 1.4;
	}

	.markdown-body :global(ul),
	.markdown-body :global(ol) {
		margin: 0.25em 0 0.5em 0;
		padding-left: 1.5em;
	}

	.markdown-body :global(li) {
		margin-bottom: 0.15em;
	}

	.markdown-body :global(blockquote) {
		margin: 0.5em 0;
		padding: 0.25em 0.75em;
		border-left: 3px solid var(--color-primary);
		color: var(--text-secondary);
	}

	.markdown-body :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
		cursor: pointer;
		font-weight: 500;
	}

	.markdown-body :global(a:hover) {
		color: var(--color-primary-hover);
	}

	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4) {
		margin: 0.5em 0 0.25em 0;
		font-weight: 600;
		font-size: 0.95em;
	}

	.markdown-body :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 0.5em 0;
		font-size: 0.85em;
	}

	.markdown-body :global(th),
	.markdown-body :global(td) {
		border: 1px solid var(--border-color);
		padding: 0.3em 0.5em;
	}

	.markdown-body :global(th) {
		background: var(--bg-gray);
		font-weight: 600;
	}

	.markdown-body :global(hr) {
		border: none;
		border-top: 1px solid var(--border-color);
		margin: 0.5em 0;
	}

	/* Loading dots */
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
