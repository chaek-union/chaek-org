<script lang="ts">
	import type { PageData } from './$types';
	import { t } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';
	import BookCard from '$lib/components/BookCard.svelte';

	let { data }: { data: PageData } = $props();

	const pageTitle = $derived(`${$t('app.title')} - ${$t('app.subtitle')}`);
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<Navbar {data} />

<main>
	<section class="hero">
		<h1>{$t('app.subtitle')}</h1>
		<p class="hero-description">{$t('app.description')}</p>
	</section>

	<section class="books">
		<div class="books-header">
			<h2>{$t('books.title')}</h2>
			{#if data.books.length > 0}
				<span class="book-count">{data.books.length} {$t('books.available')}</span>
			{/if}
		</div>

		{#if data.books.length === 0}
			<p class="empty">{$t('books.empty')}</p>
		{:else}
			<div class="book-grid">
				{#each data.books as book}
					<BookCard
						id={book.id}
						name={book.name}
						description={book.description}
						lastUpdated={book.lastUpdated}
						hasPdf={book.hasPdf}
					/>
				{/each}
			</div>
		{/if}
	</section>
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
		padding-bottom: 6rem;
	}

	.hero {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 4rem 2rem;
		text-align: center;
	}

	.hero h1 {
		font-size: 2.5rem;
		margin: 0 0 1rem 0;
		font-weight: 700;
		max-width: 1400px;
		margin-left: auto;
		margin-right: auto;
	}

	.hero-description {
		font-size: 1.2rem;
		margin: 0;
		opacity: 0.95;
		max-width: 800px;
		margin-left: auto;
		margin-right: auto;
		line-height: 1.6;
	}

	.books {
		max-width: 1400px;
		margin: 0 auto;
		padding: 3rem 2rem;
	}

	.books-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.books h2 {
		margin: 0;
		color: #333;
		font-size: 2rem;
		font-weight: 700;
	}

	.book-count {
		color: #666;
		font-size: 0.95rem;
		background: white;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		border: 1px solid #e0e0e0;
	}

	.empty {
		text-align: center;
		color: #999;
		padding: 4rem 2rem;
		font-size: 1.1rem;
		background: white;
		border-radius: 12px;
		border: 2px dashed #e0e0e0;
	}

	.book-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	@media (max-width: 768px) {
		.hero {
			padding: 3rem 1.5rem;
		}

		.hero h1 {
			font-size: 2rem;
		}

		.hero-description {
			font-size: 1rem;
		}

		.books {
			padding: 2rem 1rem;
		}

		.books h2 {
			font-size: 1.5rem;
		}

		.book-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
	}

	@media (min-width: 1400px) {
		.book-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
