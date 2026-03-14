<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';

	let { data }: { data: PageData } = $props();

	let logs = $state<any[]>([]);
	let loading = $state(true);
	let translating = $state(false);

	const pageTitle = $derived(`${data.bookId.replace(/-/g, ' ')} - Translation Logs - ${$t('app.title')}`);

	async function loadLogs() {
		loading = true;
		try {
			const response = await fetch(`/api/translations?bookId=${data.bookId}`);
			if (response.ok) {
				logs = await response.json();
			}
		} catch (e) {
			console.error('Error loading translation logs:', e);
		} finally {
			loading = false;
		}
	}

	async function triggerTranslate() {
		translating = true;
		try {
			await fetch(`/api/books/${data.bookId}/translate`, { method: 'POST' });
			setTimeout(() => loadLogs(), 500);
		} catch (e) {
			console.error('Error triggering translation:', e);
		} finally {
			translating = false;
		}
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleString($locale === 'ko' ? 'ko-KR' : 'en-US');
	}

	function formatDuration(started: string, completed: string | null) {
		if (!completed) return '-';
		const duration = new Date(completed).getTime() - new Date(started).getTime();
		const seconds = Math.floor(duration / 1000);
		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	onMount(() => {
		loadLogs();
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/builds.css" />
</svelte:head>

<Navbar {data} />

<main>
	<div class="container">
		<header class="builds-header">
			<a href="/builds" class="btn btn-gray">← Back</a>
			<h1>{data.bookId.replace(/-/g, ' ')}</h1>
			<button
				class="btn btn-success"
				onclick={triggerTranslate}
				disabled={translating}
			>
				{translating ? 'Translating...' : 'Translate'}
			</button>
		</header>

		{#if loading}
			<div class="loading">Loading...</div>
		{:else if logs.length === 0}
			<div class="empty">No translation logs found for this book</div>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>Locale</th>
							<th>{$t('builds.status')}</th>
							<th>{$t('builds.startedAt')}</th>
							<th>{$t('builds.duration')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each logs as log}
							<tr>
								<td>{log.target_locale}</td>
								<td>
									<span class="status status-{log.status}">
										{$t(`builds.${log.status}`)}
									</span>
								</td>
								<td class="date">{formatDate(log.started_at)}</td>
								<td class="duration">
									{formatDuration(log.started_at, log.completed_at)}
								</td>
								<td>
									<a href="/builds/translations/{log.id}" class="btn btn-primary">
										{$t('builds.viewLog')}
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</main>
