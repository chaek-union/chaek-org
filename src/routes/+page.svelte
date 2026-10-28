<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Navbar from '$lib/components/Navbar.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import BookInfo from '$lib/components/BookInfo.svelte';

	// Reload page data when locale changes to get translated book titles
	let initialLocale: string | null = null;
	$effect(() => {
		const current = $locale;
		if (initialLocale === null) {
			initialLocale = current;
		} else if (current !== initialLocale) {
			initialLocale = current;
			invalidateAll();
		}
	});

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
	let filterPublished = $state(false);

	function resetSearch() {
		searchQuery = '';
		filterPdf = false;
		filterPublished = false;
	}

	const pdfCount = $derived(data.books.filter((b) => b.hasPdf).length);
	const publishedCount = $derived(data.books.filter((b) => !b.isDraft).length);

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
			if (filterPublished && book.isDraft) {
				return false;
			}
			return true;
		})
	);

	// Books per shelf by viewport width; each step keeps columns >= ~165px.
	// Rows are built here (not by CSS wrapping) because every row needs its own
	// shelf.
	const SHELF_BREAKPOINTS: [minWidth: number, columns: number][] = [
		[1600, 7],
		[1320, 6],
		[1060, 5],
		[800, 4],
		[560, 3]
	];
	let viewportWidth = $state(0);
	const columns = $derived(
		viewportWidth
			? (SHELF_BREAKPOINTS.find(([min]) => viewportWidth >= min)?.[1] ?? 2)
			: SHELF_BREAKPOINTS[0][1]
	);
	const shelfRows = $derived.by(() => {
		const rows: (typeof filteredBooks)[] = [];
		for (let i = 0; i < filteredBooks.length; i += columns) {
			rows.push(filteredBooks.slice(i, i + columns));
		}
		return rows;
	});

	const pageTitle = $derived(`${$t('app.title')} - ${$t('app.subtitle')}`);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/home.css" />
</svelte:head>

<svelte:window bind:innerWidth={viewportWidth} />

<Navbar {data} overlay />

<main>
	<section class="hero">
		<h1 class="hero-title">
			<span>{$t('hero.titleLine1')}</span>
			<span>{$t('hero.titleLine2')}</span>
		</h1>
		<p class="hero-subtitle">
			<span>{$t('hero.subtitleLine1')}</span>
			<span>{$t('hero.subtitleLine2')}</span>
		</p>
	</section>

	<!-- The library wall starts right where the photo ends -->
	<div class="wall">
		<div class="search-card">
			<div class="search-field">
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
			<div class="search-filters">
				<label class="filter-checkbox">
					<input
						type="checkbox"
						checked={!filterPdf && !filterPublished}
						onchange={() => {
							filterPdf = false;
							filterPublished = false;
						}}
					/>
					<span>{$t('filter.allBooks')} ({data.books.length})</span>
				</label>
				<label class="filter-checkbox">
					<input type="checkbox" bind:checked={filterPdf} />
					<span>{$t('filter.withPdf')} ({pdfCount})</span>
				</label>
				<label class="filter-checkbox">
					<input type="checkbox" bind:checked={filterPublished} />
					<span>{$t('filter.publishedOnly')} ({publishedCount})</span>
				</label>
			</div>
		</div>

		<section class="books" id="books">
			{#if filteredBooks.length === 0}
				<!-- An empty shelf with a note, instead of a placeholder box -->
				<div class="shelf-row shelf-empty">
					<div class="shelf-container empty-note">
						<div class="empty-card">
							{#if searchQuery.trim() || filterPdf || filterPublished}
								<p>{$t('books.noMatch')}</p>
								<button type="button" class="empty-reset" onclick={resetSearch}>
									{$t('books.resetSearch')}
								</button>
							{:else}
								<p>{$t('books.empty')}</p>
							{/if}
						</div>
					</div>
					<div class="shelf" aria-hidden="true"><div class="shelf-middle"></div></div>
				</div>
			{:else}
				{#each shelfRows as row}
					<div class="shelf-row" style="--columns: {columns}">
						<div class="shelf-container shelf-columns shelf-books">
							{#each row as book (book.id)}
								<BookCover
									id={book.id}
									name={book.name}
									hasCover={book.hasCover}
									isDraft={book.isDraft}
									isHidden={book.isHidden}
								/>
							{/each}
						</div>
						<div class="shelf" aria-hidden="true"><div class="shelf-middle"></div></div>
						<div class="shelf-container shelf-columns shelf-info">
							{#each row as book (book.id)}
								<BookInfo
									id={book.id}
									name={book.name}
									lastUpdated={book.lastUpdated}
									hasPdf={book.hasPdf}
									isDraft={book.isDraft}
								/>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	</div>
</main>
