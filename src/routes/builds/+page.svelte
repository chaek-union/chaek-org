<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	type Tab = 'builds' | 'translations' | 'manage';
	let activeTab = $derived<Tab>(
		(['translations', 'manage'] as const).find((t) => t === $page.url.searchParams.get('tab')) ??
			'builds'
	);
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

	// Book ids with a settings change in flight, and the last save error
	let saving = $state<Record<string, boolean>>({});
	let saveError = $state<string | null>(null);

	async function setBookSetting(book: any, key: 'isDraft' | 'isHidden', value: boolean) {
		if (book[key] === value || saving[book.id]) return;
		const previous = book[key];
		book[key] = value; // optimistic
		saving[book.id] = true;
		saveError = null;
		try {
			const response = await fetch(`/api/books/${book.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [key]: value })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const result = await response.json();
			book.isDraft = result.isDraft;
			book.isHidden = result.isHidden;
		} catch (e) {
			console.error('Failed to save book settings:', e);
			book[key] = previous;
			saveError = $t('manage.saveFailed');
		} finally {
			saving[book.id] = false;
		}
	}

	onMount(() => {
		loadBooks();
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/builds.css?v=3" />
</svelte:head>

<Navbar {data} fullWidth />

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
		<button
			class="tab"
			class:active={activeTab === 'manage'}
			onclick={() => goto('/builds?tab=manage')}
		>
			{$t('manage.tab')}
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
	{:else if activeTab === 'manage'}
		{#if loading}
			<div class="loading">Loading...</div>
		{:else if error}
			<div class="error">{error}</div>
		{:else if books.length === 0}
			<div class="empty">No books found</div>
		{:else}
			{#if saveError}
				<div class="error">{saveError}</div>
			{/if}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>{$t('builds.bookName')}</th>
							<th>{$t('manage.status')}</th>
							<th>{$t('manage.visibility')}</th>
						</tr>
					</thead>
					<tbody>
						{#each books as book (book.id)}
							<tr>
								<td class="book-name">{book.name}</td>
								<td>
									<div class="segmented" role="group" aria-label={$t('manage.status')}>
										<button
											type="button"
											class:active={book.isDraft}
											aria-pressed={book.isDraft}
											disabled={saving[book.id]}
											onclick={() => setBookSetting(book, 'isDraft', true)}
										>
											{$t('manage.draft')}
										</button>
										<button
											type="button"
											class:active={!book.isDraft}
											aria-pressed={!book.isDraft}
											disabled={saving[book.id]}
											onclick={() => setBookSetting(book, 'isDraft', false)}
										>
											{$t('manage.published')}
										</button>
									</div>
								</td>
								<td>
									<div class="segmented" role="group" aria-label={$t('manage.visibility')}>
										<button
											type="button"
											class:active={!book.isHidden}
											aria-pressed={!book.isHidden}
											disabled={saving[book.id]}
											onclick={() => setBookSetting(book, 'isHidden', false)}
										>
											{$t('manage.visible')}
										</button>
										<button
											type="button"
											class:active={book.isHidden}
											aria-pressed={book.isHidden}
											disabled={saving[book.id]}
											onclick={() => setBookSetting(book, 'isHidden', true)}
										>
											{$t('manage.hidden')}
										</button>
									</div>
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
