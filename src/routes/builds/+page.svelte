<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'builds' | 'translations'>('builds');
	let books = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let translatingBooks = $state<Set<string>>(new Set());
	let translatingAll = $state(false);
	let translateErrors = $state<Array<{ bookId: string; message: string }>>([]);

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

	function dismissTranslateError(index: number) {
		translateErrors = translateErrors.filter((_, i) => i !== index);
	}

	async function triggerTranslate(bookId: string) {
		translatingBooks = new Set([...translatingBooks, bookId]);
		try {
			const res = await fetch(`/api/books/${bookId}/translate`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				translateErrors = [...translateErrors, { bookId, message: body.error || `HTTP ${res.status}` }];
			}
		} catch (e) {
			translateErrors = [...translateErrors, { bookId, message: String(e) }];
		} finally {
			translatingBooks = new Set([...translatingBooks].filter(id => id !== bookId));
		}
	}

	async function triggerTranslateAll() {
		translatingAll = true;
		try {
			await Promise.all(books.map(book => triggerTranslate(book.id)));
		} finally {
			translatingAll = false;
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
			onclick={() => activeTab = 'builds'}
		>
			빌드 로그
		</button>
		<button
			class="tab"
			class:active={activeTab === 'translations'}
			onclick={() => activeTab = 'translations'}
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
							<th>Last Updated</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each books as book}
							<tr>
								<td class="book-name">{book.name}</td>
								<td class="date">
									{book.lastUpdated ? new Date(book.lastUpdated).toLocaleDateString($locale === 'ko' ? 'ko-KR' : 'en-US') : '-'}
								</td>
								<td class="actions">
									<a href="/builds/book/{book.id}" class="btn btn-primary">
										View Builds
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<div class="tab-actions">
			<button
				class="btn btn-primary"
				onclick={triggerTranslateAll}
				disabled={translatingAll || books.length === 0}
			>
				{translatingAll ? 'Translating...' : 'Translate All'}
			</button>
		</div>

		{#if translateErrors.length > 0}
			<div class="translate-errors">
				{#each translateErrors as err, i}
					<div class="translate-error">
						<span>Translation failed for <strong>{err.bookId}</strong>: {err.message}</span>
						<button class="dismiss-btn" onclick={() => dismissTranslateError(i)}>&times;</button>
					</div>
				{/each}
			</div>
		{/if}

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
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each books as book}
							<tr>
								<td class="book-name">{book.name}</td>
								<td class="actions">
									<a href="/builds/translations/book/{book.id}" class="btn btn-primary">
										View Logs
									</a>
									<button
										class="btn btn-gray"
										onclick={() => triggerTranslate(book.id)}
										disabled={translatingBooks.has(book.id)}
									>
										{translatingBooks.has(book.id) ? 'Translating...' : 'Translate'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</main>
