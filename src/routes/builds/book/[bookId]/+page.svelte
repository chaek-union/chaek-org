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
	<link rel="stylesheet" href="/builds.css" />
</svelte:head>

<Navbar {data} />

<main>
	<div class="container">
		<header class="builds-header">
			<a href="/builds" class="btn btn-gray">← Back to Books</a>
			<h1>{data.bookId.replace(/-/g, ' ')}</h1>
			<button
				class="btn btn-success"
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
			<div class="table-container">
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
									<a href="/builds/{build.id}" class="btn btn-primary">
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
