<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let activeTab = $derived<'builds' | 'translations'>($page.url.searchParams.get('tab') === 'translations' ? 'translations' : 'builds');
	let books = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const pageTitle = $derived(`${$t('builds.title')} - ${$t('app.title')}`);

	async function loadBooks() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/books');
			if (!response.ok) {
				if (response.status === 401) {
					error = $t('builds.unauthorized');
				} else {
					throw new Error('Failed to load books');
				}
				return;
			}
			books = await response.json();
		} catch (e) {
			console.error('Error loading books:', e);
			error = 'Failed to load books';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadBooks();
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/builds.css" />
</svelte:head>

<Navbar {data} />

<main class="container">
	<header class="builds-header">
		<h1>{$t('builds.title')}</h1>
	</header>

	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'builds'}
			onclick={() => goto('/builds')}
		>
			빌드 로그
		</button>
		<button
			class="tab"
			class:active={activeTab === 'translations'}
			onclick={() => goto('/builds?tab=translations')}
		>
			번역 로그
		</button>
	</div>

	{#if activeTab === 'builds'}
		{#if loading}
			<div class="loading">Loading...</div>
		{:else if error}
			<div class="error">{error}</div>
		{:else if books.length === 0}
			<div class="empty">No books found</div>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>Book Name</th>
							<th>{$t('builds.status')}</th>
							<th>Last Updated</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each books as book}
							<tr>
								<td class="book-name">{book.name}</td>
								<td>
									{#if book.latestBuildStatus}
										<span class="status status-{book.latestBuildStatus}">
											{$t(`builds.${book.latestBuildStatus}`)}
										</span>
									{:else}
										<span class="status status-none">-</span>
									{/if}
								</td>
								<td class="date">
									{book.lastUpdated ? new Date(book.lastUpdated).toLocaleDateString($locale === 'ko' ? 'ko-KR' : 'en-US') : '-'}
								</td>
								<td class="actions">
									<a href="/builds/book/{book.id}" class="btn btn-primary">
										View Logs
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		{#if loading}
			<div class="loading">Loading...</div>
		{:else if books.length === 0}
			<div class="empty">No books found</div>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>Book Name</th>
							<th>{$t('builds.status')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each books as book}
							<tr>
								<td class="book-name">{book.name}</td>
								<td>
									{#if book.latestTranslationStatus}
										<span class="status status-{book.latestTranslationStatus}">
											{$t(`builds.${book.latestTranslationStatus}`)}
										</span>
									{:else}
										<span class="status status-none">-</span>
									{/if}
								</td>
								<td class="actions">
									<a href="/builds/translations/book/{book.id}" class="btn btn-primary">
										View Logs
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</main>
