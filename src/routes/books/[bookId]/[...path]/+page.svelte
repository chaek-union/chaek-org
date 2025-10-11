<script lang="ts">
	import type { PageData } from './$types';
	import type { NavItem } from '$lib/server/summary-parser';
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let searchResults = $state<Array<{ path: string; title: string; score: number }>>([]);
	let isSearching = $state(false);
	let highlightTerms = $state<string[]>([]);
	let currentHighlightIndex = $state(0);
	let allHighlights: HTMLElement[] = $state([]);
	const pageTitle = $derived(`${data.book.name} - ${$t('app.title')}`);
	let sidebarOpen = $state(false);

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	// Apply highlights whenever content changes
	$effect(() => {
		// Track data.htmlContent and currentPath to re-run when page changes
		data.htmlContent;
		data.currentPath;

		// Re-apply highlights if we have search terms
		if (highlightTerms.length > 0) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(async () => {
				// Scroll to top immediately (synchronously)
				const wrapper = document.querySelector('.book-content-wrapper');
				if (wrapper) {
					wrapper.scrollTop = 0;
				}

				highlightSearchTerms();

				// Scroll to first highlight after images loaded
				await updateCurrentHighlight(true);
			}, 0);
		} else {
			// No search active, scroll to top
			const wrapper = document.querySelector('.book-content-wrapper');
			if (wrapper) {
				wrapper.scrollTop = 0;
			}
		}
	});

	async function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			highlightTerms = [];
			removeHighlights();
			return;
		}

		// Debounce search
		if (searchTimeout) clearTimeout(searchTimeout);

		searchTimeout = setTimeout(async () => {
			isSearching = true;
			try {
				const response = await fetch(
					`/api/books/${data.book.id}/search?q=${encodeURIComponent(searchQuery)}`
				);
				const result = await response.json();
				searchResults = result.results || [];

				// Extract search terms for highlighting
				highlightTerms = searchQuery.trim().split(/\s+/).filter(Boolean);
				highlightSearchTerms();
			} catch (err) {
				console.error('Search failed:', err);
				searchResults = [];
				highlightTerms = [];
			} finally {
				isSearching = false;
			}
		}, 300);
	}

	function highlightSearchTerms() {
		if (!highlightTerms.length) return;

		const contentDiv = document.querySelector('.book-content');
		if (!contentDiv) return;

		removeHighlights();

		// Create a regex for all search terms
		const pattern = highlightTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		const regex = new RegExp(`(${pattern})`, 'gi');

		// Walk through text nodes and highlight
		const walker = document.createTreeWalker(
			contentDiv,
			NodeFilter.SHOW_TEXT,
			null
		);

		const nodesToReplace: { node: Node; parent: Node }[] = [];
		let node: Node | null;

		while ((node = walker.nextNode())) {
			if (node.nodeValue && regex.test(node.nodeValue)) {
				nodesToReplace.push({ node, parent: node.parentNode! });
			}
		}

		nodesToReplace.forEach(({ node, parent }) => {
			const span = document.createElement('span');
			span.innerHTML = node.nodeValue!.replace(
				regex,
				'<mark class="search-highlight">$1</mark>'
			);
			parent.replaceChild(span, node);
		});

		// Collect all highlights and set current to first one
		allHighlights = Array.from(document.querySelectorAll('.search-highlight'));
		currentHighlightIndex = 0;
	}

	function removeHighlights() {
		const highlights = document.querySelectorAll('.search-highlight');
		highlights.forEach((mark) => {
			const parent = mark.parentNode;
			if (parent) {
				parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
				parent.normalize();
			}
		});
		allHighlights = [];
		currentHighlightIndex = 0;
	}

	async function updateCurrentHighlight(waitForImages = false) {
		// Remove current class from all
		allHighlights.forEach(el => el.classList.remove('search-highlight-current'));

		// Add current class to active highlight
		if (allHighlights.length > 0 && currentHighlightIndex < allHighlights.length) {
			const current = allHighlights[currentHighlightIndex];
			current.classList.add('search-highlight-current');

			// Wait for images to load if requested (for initial page load)
			if (waitForImages) {
				const contentDiv = document.querySelector('.book-content');
				if (contentDiv) {
					const images = Array.from(contentDiv.querySelectorAll('img'));
					await Promise.all(
						images.map(img => {
							if (img.complete) return Promise.resolve();
							return new Promise((resolve) => {
								img.addEventListener('load', resolve);
								img.addEventListener('error', resolve);
							});
						})
					);
				}
			}

			current.scrollIntoView({ behavior: 'auto', block: 'center' });
		}
	}

	function goToPrevHighlight() {
		if (allHighlights.length === 0) return;
		currentHighlightIndex = (currentHighlightIndex - 1 + allHighlights.length) % allHighlights.length;
		updateCurrentHighlight();
	}

	function goToNextHighlight() {
		if (allHighlights.length === 0) return;
		currentHighlightIndex = (currentHighlightIndex + 1) % allHighlights.length;
		updateCurrentHighlight();
	}

	function renderNavigation(items: NavItem[], level = 0, filterPaths: Set<string> | null = null): string {
		let html = '<ul class="summary">';

		for (const item of items) {
			// If filtering, check if this item or its children match
			if (filterPaths && !item.isHeader) {
				const hasMatch = item.path && filterPaths.has(item.path);
				const hasChildMatch = item.children?.some(child =>
					child.path && filterPaths.has(child.path)
				);

				if (!hasMatch && !hasChildMatch) {
					continue;
				}
			}

			if (item.isHeader) {
				html += `<li class="header">${item.title}</li>`;
				if (item.children) {
					html += renderNavigation(item.children, level, filterPaths);
				}
			} else {
				const isActive = item.path === data.currentPath;
				const activeClass = isActive ? ' class="active"' : '';
				html += `<li${activeClass}>`;
				if (item.path) {
					// Translate special __INTRODUCTION__ marker
					const displayTitle = item.title === '__INTRODUCTION__' ? $t('book.introduction') : item.title;
					// Remove .md extension from URL
					const urlPath = item.path.replace(/\.md$/, '');
					html += `<a href="/books/${data.book.id}/${urlPath}">${displayTitle}</a>`;
				} else {
					html += `<span>${item.title}</span>`;
				}
				if (item.children) {
					html += renderNavigation(item.children, level + 1, filterPaths);
				}
				html += '</li>';
			}
		}

		html += '</ul>';
		return html;
	}

	// Get set of filtered paths from search results
	const filteredPaths = $derived(
		searchResults.length > 0 ? new Set(searchResults.map(r => r.path)) : null
	);

	function handleLinkClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const link = target.closest('a');

		if (!link) return;

		const href = link.getAttribute('href');
		if (!href) return;

		// Handle anchor links (same page)
		if (href.startsWith('#')) {
			e.preventDefault();
			const id = href.substring(1);
			// Use getElementById which doesn't require CSS selector escaping
			const element = document.getElementById(id);
			if (element) {
				element.scrollIntoView({ behavior: 'auto', block: 'start' });
				// Update URL hash without triggering navigation
				history.replaceState(null, '', window.location.pathname + href);
			}
			return;
		}

		// Handle internal markdown links
		if (href.endsWith('.md') && !href.startsWith('http') && !href.startsWith('//')) {
			e.preventDefault();

			// Remove .md extension
			let targetPath = href.replace(/\.md$/, '');

			if (href.startsWith('../')) {
				// Cross-book navigation
				const match = href.match(/^\.\.\/([^\/]+)\/(.*)\.md$/);
				if (match) {
					const [, bookId, path] = match;
					goto(`/books/${bookId}/${path}`);
					return;
				}
			}

			// Same book navigation
			goto(`/books/${data.book.id}/${targetPath}`);
		}
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/book-viewer.css" />
	<base href="/books/{data.book.id}/" />
</svelte:head>

<div class="container">
	<header>
		<button class="hamburger" onclick={toggleSidebar} aria-label="Toggle menu">
			<span></span>
			<span></span>
			<span></span>
		</button>

		<div class="header-content">
			<a href="/" class="back-link">← {$t('nav.backToList')}</a>
			<h1>{data.book.name}</h1>
		</div>
		<div class="header-actions">
			<LanguageSwitcher />
		</div>
	</header>

	<div class="book-viewer">
		<!-- Sidebar overlay for mobile -->
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="sidebar-overlay" onclick={closeSidebar}></div>
		{/if}

		<div class="book-sidebar" class:open={sidebarOpen}>
			<div class="book-search">
				<input
					type="search"
					placeholder={$t('book.search')}
					bind:value={searchQuery}
					oninput={handleSearch}
				/>
			</div>

			{#if isSearching}
				<div class="no-results">Searching...</div>
			{:else if searchQuery && searchResults.length === 0}
				<div class="no-results">{$t('book.noResults')}</div>
			{:else}
				<nav>
					{@html renderNavigation(data.navigation, 0, filteredPaths)}
				</nav>
			{/if}
		</div>

		<div class="book-main">
			{#if highlightTerms.length > 0 && allHighlights.length > 0}
				<div class="search-navigation">
					<button
						onclick={goToPrevHighlight}
						class="nav-button"
					>
						← Previous
					</button>
					<span class="search-position">
						{currentHighlightIndex + 1} / {allHighlights.length}
					</span>
					<button
						onclick={goToNextHighlight}
						class="nav-button"
					>
						Next →
					</button>
				</div>
			{/if}

			<div class="book-content-wrapper">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="book-content" onclick={handleLinkClick}>
					{@html data.htmlContent}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		background: #f5f5f5;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	header {
		background: white;
		padding: 1rem 2rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		z-index: 100;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 2rem;
		flex-shrink: 0;
		position: relative;
	}

	.hamburger {
		display: none;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 8px;
	}

	.hamburger span {
		width: 24px;
		height: 3px;
		background: #333;
		border-radius: 2px;
		transition: all 0.3s;
	}

	.sidebar-overlay {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 90;
	}

	.header-content {
		flex: 1;
		min-width: 0;
	}

	.header-actions {
		flex-shrink: 0;
	}

	.back-link {
		display: inline-block;
		color: #4285f4;
		text-decoration: none;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	header h1 {
		margin: 0;
		font-size: 1.5rem;
		color: #333;
		text-transform: capitalize;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.book-viewer {
		flex: 1;
		overflow: hidden;
	}

	.search-navigation {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 10px;
		background: #f8f9fa;
		border-bottom: 1px solid #ddd;
		flex-shrink: 0;
	}

	.nav-button {
		padding: 8px 12px;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.nav-button:hover:not(:disabled) {
		background: #008cff;
		color: white;
		border-color: #008cff;
	}

	.nav-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.search-position {
		font-size: 0.9rem;
		color: #666;
		min-width: 80px;
		text-align: center;
	}

	@media (max-width: 768px) {
		.hamburger {
			display: flex;
		}

		.sidebar-overlay {
			display: block;
		}

		header {
			padding: 0.75rem 1rem;
		}

		header h1 {
			font-size: 1.1rem;
		}

		.back-link {
			font-size: 0.85rem;
		}
	}
</style>
