<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';

	let { data }: { data: PageData } = $props();

	let builds = $state<any[]>([]);
	let loading = $state(true);
	let triggeringBuild = $state(false);

	const pageTitle = $derived(`${data.bookId.replace(/-/g, ' ')} Builds - ${$t('app.title')}`);

	async function loadBuilds() {
		loading = true;
		try {
			const response = await fetch(`/api/builds?bookId=${data.bookId}`);
			if (response.ok) {
				builds = await response.json();
			}
		} catch (e) {
			console.error('Error loading builds:', e);
		} finally {
			loading = false;
		}
	}

	async function triggerBuild() {
		triggeringBuild = true;
		try {
			const response = await fetch(`/api/builds/trigger`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookId: data.bookId })
			});
			if (response.ok) {
				await loadBuilds();
			}
		} catch (e) {
			console.error('Error triggering build:', e);
		} finally {
			triggeringBuild = false;
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
		if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		}
		return `${seconds}s`;
	}

	onMount(() => {
		loadBuilds();
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<Navbar {data} />

<main>
	<div class="container">
		<header class="builds-header">
			<a href="/builds" class="btn-back">← Back to Books</a>
			<h1>{data.bookId.replace(/-/g, ' ')}</h1>
			<button
				class="btn-trigger"
				onclick={triggerBuild}
				disabled={triggeringBuild}
			>
				{triggeringBuild ? 'Building...' : 'Trigger Build'}
			</button>
		</header>

		{#if loading}
			<div class="loading">Loading builds...</div>
		{:else if builds.length === 0}
			<div class="empty">No builds found for this book</div>
		{:else}
			<div class="builds-table">
				<table>
					<thead>
						<tr>
							<th>{$t('builds.status')}</th>
							<th>{$t('builds.startedAt')}</th>
							<th>{$t('builds.duration')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each builds as build}
							<tr>
								<td>
									<span class="status status-{build.status}">
										{$t(`builds.${build.status}`)}
									</span>
								</td>
								<td class="date">{formatDate(build.started_at)}</td>
								<td class="duration">
									{formatDuration(build.started_at, build.completed_at)}
								</td>
								<td>
									<a href="/builds/{build.id}" class="btn-view">
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
	}

	.builds-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.builds-header h1 {
		flex: 1;
		font-size: 2rem;
		font-weight: 700;
		color: #333;
		margin: 0;
		text-transform: capitalize;
	}

	.btn-back {
		background: #6c757d;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.2s;
		text-decoration: none;
	}

	.btn-back:hover {
		background: #5a6268;
	}

	.btn-trigger {
		background: #28a745;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.btn-trigger:hover:not(:disabled) {
		background: #218838;
	}

	.btn-trigger:disabled {
		background: #6c757d;
		cursor: not-allowed;
	}

	.loading,
	.empty {
		text-align: center;
		padding: 4rem 2rem;
		font-size: 1.1rem;
		background: white;
		border-radius: 12px;
	}

	.empty {
		color: #999;
	}

	.builds-table {
		background: white;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 1rem;
		text-align: left;
		border-bottom: 1px solid #e0e0e0;
	}

	th {
		background: #f8f9fa;
		font-weight: 600;
		color: #333;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	td {
		color: #666;
	}

	.date,
	.duration {
		font-size: 0.9rem;
		font-family: monospace;
	}

	.status {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.85rem;
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

	.btn-view {
		background: #4285f4;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.2s;
		text-decoration: none;
	}

	.btn-view:hover {
		background: #3367d6;
		transform: translateY(-1px);
	}

	@media (max-width: 768px) {
		.container {
			padding: 0 1rem;
		}

		.builds-header h1 {
			font-size: 1.25rem;
		}

		.builds-table {
			overflow-x: auto;
		}

		table {
			min-width: 600px;
		}

		th,
		td {
			padding: 0.75rem 0.5rem;
			font-size: 0.85rem;
		}
	}
</style>
