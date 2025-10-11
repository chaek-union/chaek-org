<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let builds = $state<any[]>([]);
	let selectedBuild = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const pageTitle = $derived(`${$t('builds.title')} - ${$t('app.title')}`);

	async function loadBuilds() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/builds?latest=true');
			if (!response.ok) {
				if (response.status === 401) {
					error = $t('builds.unauthorized');
				} else {
					throw new Error('Failed to load builds');
				}
				return;
			}
			builds = await response.json();
		} catch (e) {
			console.error('Error loading builds:', e);
			error = 'Failed to load build logs';
		} finally {
			loading = false;
		}
	}

	async function viewBuildLog(buildId: number) {
		try {
			const response = await fetch(`/api/builds/${buildId}`);
			if (response.ok) {
				selectedBuild = await response.json();
			}
		} catch (e) {
			console.error('Error loading build log:', e);
		}
	}

	function closeBuildLog() {
		selectedBuild = null;
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
		<header>
			<h1>{$t('builds.title')}</h1>
		</header>

		{#if loading}
			<div class="loading">Loading...</div>
		{:else if error}
			<div class="error">{error}</div>
		{:else if builds.length === 0}
			<div class="empty">{$t('builds.empty')}</div>
		{:else}
			<div class="builds-table">
				<table>
					<thead>
						<tr>
							<th>{$t('builds.bookName')}</th>
							<th>{$t('builds.status')}</th>
							<th>{$t('builds.startedAt')}</th>
							<th>{$t('builds.duration')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each builds as build}
							<tr>
								<td class="book-name">{build.book_name}</td>
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
									<button class="btn-view" onclick={() => viewBuildLog(build.id)}>
										{$t('builds.viewLog')}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</main>

{#if selectedBuild}
	<div class="modal-overlay" onclick={closeBuildLog}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>{selectedBuild.book_name}</h2>
				<button class="btn-close" onclick={closeBuildLog}>✕</button>
			</div>
			<div class="modal-body">
				<div class="build-info">
					<div class="info-item">
						<strong>{$t('builds.status')}:</strong>
						<span class="status status-{selectedBuild.status}">
							{$t(`builds.${selectedBuild.status}`)}
						</span>
					</div>
					<div class="info-item">
						<strong>{$t('builds.startedAt')}:</strong>
						{formatDate(selectedBuild.started_at)}
					</div>
					{#if selectedBuild.completed_at}
						<div class="info-item">
							<strong>{$t('builds.completedAt')}:</strong>
							{formatDate(selectedBuild.completed_at)}
						</div>
					{/if}
				</div>

				{#if selectedBuild.stdout}
					<div class="log-section">
						<h3>{$t('builds.stdout')}</h3>
						<pre class="log-content">{selectedBuild.stdout}</pre>
					</div>
				{/if}

				{#if selectedBuild.stderr}
					<div class="log-section">
						<h3>{$t('builds.stderr')}</h3>
						<pre class="log-content error">{selectedBuild.stderr}</pre>
					</div>
				{/if}

				{#if selectedBuild.error_message}
					<div class="log-section">
						<h3>{$t('builds.errorMessage')}</h3>
						<pre class="log-content error">{selectedBuild.error_message}</pre>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

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

	header {
		margin-bottom: 2rem;
	}

	header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: #333;
		margin: 0;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 4rem 2rem;
		font-size: 1.1rem;
		background: white;
		border-radius: 12px;
	}

	.error {
		color: #dc3545;
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

	.book-name {
		font-weight: 500;
		color: #333;
		text-transform: capitalize;
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
	}

	.btn-view:hover {
		background: #3367d6;
		transform: translateY(-1px);
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 2rem;
	}

	.modal {
		background: white;
		border-radius: 12px;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		padding: 1.5rem 2rem;
		border-bottom: 1px solid #e0e0e0;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #333;
		text-transform: capitalize;
	}

	.btn-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #999;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		line-height: 1;
		transition: color 0.2s;
	}

	.btn-close:hover {
		color: #333;
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
	}

	.build-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-item strong {
		font-size: 0.85rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.log-section {
		margin-bottom: 1.5rem;
	}

	.log-section h3 {
		font-size: 1rem;
		color: #333;
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.log-content {
		background: #1e1e1e;
		color: #d4d4d4;
		padding: 1rem;
		border-radius: 8px;
		overflow-x: auto;
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0;
		font-family: 'Consolas', 'Monaco', monospace;
		max-height: 400px;
		overflow-y: auto;
	}

	.log-content.error {
		background: #2d0a0e;
		color: #ff6b6b;
	}

	@media (max-width: 768px) {
		.container {
			padding: 0 1rem;
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

		.modal {
			margin: 1rem;
		}

		.modal-body {
			padding: 1rem;
		}
	}
</style>
