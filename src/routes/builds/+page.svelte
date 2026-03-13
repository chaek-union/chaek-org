<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let books = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let translatingBooks = $state<Set<string>>(new Set());
	let translatingAll = $state(false);

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

	async function triggerTranslate(bookId: string) {
		translatingBooks = new Set([...translatingBooks, bookId]);
		try {
			await fetch(`/api/books/${bookId}/translate`, { method: 'POST' });
		} catch (e) {
			console.error('Error triggering translation:', e);
		} finally {
			translatingBooks = new Set([...translatingBooks].filter(id => id !== bookId));
		}
	}

	async function triggerTranslateAll() {
		translatingAll = true;
		try {
			await Promise.all(books.map(book => fetch(`/api/books/${book.id}/translate`, { method: 'POST' })));
		} catch (e) {
			console.error('Error triggering translations:', e);
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
		<button
			class="btn btn-primary"
			onclick={triggerTranslateAll}
			disabled={translatingAll || books.length === 0}
		>
			{translatingAll ? 'Translating...' : 'Translate All'}
		</button>
	</header>

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
</main>
