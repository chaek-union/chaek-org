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
	let translateErrors = $state<Array<{ bookId: string; message: string }>>([]);
	let translationLogs = $state<any[]>([]);

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

	async function loadTranslationLogs() {
		try {
			const response = await fetch('/api/translations');
			if (response.ok) {
				translationLogs = await response.json();
			}
		} catch (e) {
			console.error('Error loading translation logs:', e);
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
			} else {
				// Reload translation logs after triggering
				setTimeout(() => loadTranslationLogs(), 500);
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
		loadBooks();
		loadTranslationLogs();
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

	{#if translationLogs.length > 0}
		<h2 class="section-title">Translation Logs</h2>
		<div class="table-container">
			<table>
				<thead>
					<tr>
						<th>Book</th>
						<th>Locale</th>
						<th>Status</th>
						<th>Started</th>
						<th>Duration</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each translationLogs as log}
						<tr>
							<td class="book-name">{log.book_id}</td>
							<td>{log.target_locale}</td>
							<td>
								<span class="status status-{log.status}">{log.status}</span>
							</td>
							<td class="date">{formatDate(log.started_at)}</td>
							<td class="duration">{formatDuration(log.started_at, log.completed_at)}</td>
							<td>
								<a href="/builds/translations/{log.id}" class="btn btn-primary">
									View Log
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>
