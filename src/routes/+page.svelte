<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	export let data: PageData;

	$: pageTitle = `${$t('app.title')} - ${$t('app.subtitle')}`;
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<main>
	<header>
		<div class="header-top">
			<LanguageSwitcher />
		</div>
		<h1>📚 {$t('app.title')}</h1>
		<p>{$t('app.subtitle')}</p>
	</header>

	<section class="books">
		<h2>{$t('books.title')}</h2>
		{#if data.books.length === 0}
			<p class="empty">{$t('books.empty')}</p>
		{:else}
			<div class="book-grid">
				{#each data.books as book}
					<a href="/books/{book.id}" class="book-card">
						<h3>{book.name}</h3>
						{#if book.description}
							<p class="description">{book.description}</p>
						{/if}
						{#if book.lastUpdated}
							<p class="updated">
								{$t('books.lastUpdated')}: {new Date(book.lastUpdated).toLocaleDateString(
									$locale === 'ko' ? 'ko-KR' : 'en-US'
								)}
							</p>
						{/if}
					</a>
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
		background: #f5f5f5;
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 3rem;
		padding: 2rem;
		background: white;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		position: relative;
	}

	.header-top {
		position: absolute;
		top: 1rem;
		right: 1rem;
	}

	header h1 {
		font-size: 3rem;
		margin: 0 0 0.5rem 0;
		color: #333;
	}

	header p {
		font-size: 1.2rem;
		color: #666;
		margin: 0;
	}

	.books {
		background: white;
		border-radius: 8px;
		padding: 2rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.books h2 {
		margin: 0 0 1.5rem 0;
		color: #333;
		font-size: 1.5rem;
	}

	.empty {
		text-align: center;
		color: #999;
		padding: 3rem;
		font-size: 1.1rem;
	}

	.book-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.book-card {
		display: block;
		padding: 1.5rem;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
		background: #fafafa;
	}

	.book-card:hover {
		border-color: #4285f4;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.book-card h3 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.3rem;
		text-transform: capitalize;
	}

	.book-card .description {
		color: #666;
		margin: 0 0 0.5rem 0;
		line-height: 1.5;
	}

	.book-card .updated {
		margin: 0;
		font-size: 0.85rem;
		color: #999;
	}
</style>
