<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';

	let { data }: { data: PageData } = $props();

	let logs = $state<string[]>([]);
	let status = $state(data.initialStatus);
	let eventSource: EventSource | null = null;

	const pageTitle = $derived(`Build Log #${data.buildId} - ${$t('app.title')}`);

	onMount(() => {
		// Connect to SSE stream
		eventSource = new EventSource(`/api/builds/${data.buildId}/stream`);

		eventSource.onmessage = (event) => {
			const logEvent = JSON.parse(event.data);

			if (logEvent.type === 'stdout' || logEvent.type === 'stderr') {
				logs = [...logs, logEvent.data];
			} else if (logEvent.type === 'status') {
				status = logEvent.data;
				logs = [...logs, `[Status] ${logEvent.data}`];
			} else if (logEvent.type === 'complete') {
				logs = [...logs, '[Build completed]'];
				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}
			}

			// Auto-scroll to bottom
			setTimeout(() => {
				const logContainer = document.querySelector('.log-container');
				if (logContainer) {
					logContainer.scrollTop = logContainer.scrollHeight;
				}
			}, 10);
		};

		eventSource.onerror = () => {
			logs = [...logs, '[Connection lost]'];
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
		};
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
		}
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<Navbar {data} />

<main>
	<div class="container">
		<header>
			<a href="/builds" class="back-link">← Back to Builds</a>
			<h1>Build Log #{data.buildId}</h1>
			<span class="status status-{status}">{status}</span>
		</header>

		<div class="log-container">
			<pre class="log-content">{#each logs as log}
{log}
{/each}</pre>
		</div>
	</div>
</main>

<style>
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
		margin: 0;
		padding: 0;
		background: #f8f9fa;
	}

	main {
		width: 100%;
		min-height: calc(100vh - 70px);
		padding: 2rem 0;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
		height: calc(100vh - 140px);
		display: flex;
		flex-direction: column;
	}

	header {
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-link {
		color: #4285f4;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #333;
		margin: 0;
		flex: 1;
	}

	.status {
		display: inline-block;
		padding: 0.5rem 1rem;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.status-running {
		background: #fff3cd;
		color: #856404;
	}

	.status-success {
		background: #d4edda;
		color: #155724;
	}

	.status-failed {
		background: #f8d7da;
		color: #721c24;
	}

	.log-container {
		flex: 1;
		background: #1e1e1e;
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.log-content {
		flex: 1;
		margin: 0;
		padding: 1rem;
		color: #d4d4d4;
		font-family: 'Consolas', 'Monaco', monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		overflow-y: auto;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	@media (max-width: 768px) {
		.container {
			padding: 0 1rem;
		}

		header h1 {
			font-size: 1.25rem;
		}
	}
</style>
