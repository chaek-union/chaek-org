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
	<link rel="stylesheet" href="/builds.css" />
</svelte:head>

<Navbar {data} />

<main class="log-page">
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
