<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

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
		{:else if books.length === 0}
			<div class="empty">No books found</div>
		{:else}
			<div class="builds-table">
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
								<td>
									<a href="/builds/book/{book.id}" class="btn-view">
										View Builds
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

	.date {
		font-size: 0.9rem;
		font-family: monospace;
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

	.btn-view {
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
