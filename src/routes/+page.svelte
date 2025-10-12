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
	<link rel="stylesheet" href="/home.css" />
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
			<div class="grid grid-auto">
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
