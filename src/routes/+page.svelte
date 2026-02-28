<script lang="ts">
	import type { PageData } from './$types';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import BookCard from '$lib/components/BookCard.svelte';

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://kasra.kr/kasra-family-bar.js';
		script.dataset.current = 'Chaek';
		document.body.appendChild(script);

		const wrapper = document.querySelector('.content-wrapper') as HTMLElement;
		if (wrapper) wrapper.style.top = '32px';

		return () => {
			script.remove();
			document.getElementById('kasra-family-bar')?.remove();
			document.body.style.marginTop = '';
			if (wrapper) wrapper.style.top = '';
		};
	});

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let filterPdf = $state(false);

	const pdfCount = $derived(data.books.filter((b) => b.hasPdf).length);

	const filteredBooks = $derived(
		data.books.filter((book) => {
			if (searchQuery.trim() !== '') {
				if (!book.name.toLowerCase().includes(searchQuery.toLowerCase())) {
					return false;
				}
			}
			if (filterPdf && !book.hasPdf) {
				return false;
			}
			return true;
		})
	);

	const pageTitle = $derived(`${$t('app.title')} - ${$t('app.subtitle')}`);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/home.css" />
</svelte:head>

<Navbar {data} />

<main>
	<section class="hero">
		<h1>{$t('hero.headlinePrefix')}<strong>{$t('hero.headlineBold')}</strong>{$t('hero.headline')}<strong>{$t('hero.headlineHighlight')}</strong>{$t('hero.headlineSuffix')}</h1>
		<div class="hero-search">
			<svg
				class="search-icon"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<input
				type="text"
				placeholder={$t('hero.searchPlaceholder')}
				bind:value={searchQuery}
			/>
		</div>
	</section>

	<div class="content-layout">
		<aside class="filter-sidebar">
			<h3 class="filter-title">{$t('filter.title')}</h3>
			<div class="filter-group">
				<label class="filter-checkbox">
					<input type="checkbox" checked={!filterPdf} onchange={() => (filterPdf = false)} />
					<span>{$t('filter.allBooks')} ({data.books.length})</span>
				</label>
				<label class="filter-checkbox">
					<input type="checkbox" bind:checked={filterPdf} />
					<span>{$t('filter.withPdf')} ({pdfCount})</span>
				</label>
			</div>
		</aside>

		<section class="books" id="books">
			{#if filteredBooks.length === 0}
				<p class="empty">{$t('books.empty')}</p>
			{:else}
				<div class="grid grid-auto">
					{#each filteredBooks as book}
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
	</div>
</main>
