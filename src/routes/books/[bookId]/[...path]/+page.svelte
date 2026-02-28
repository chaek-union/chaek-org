<script lang="ts">
	import type { PageData } from './$types';
	import type { NavItem } from '$lib/server/summary-parser';
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import Navbar from '$lib/components/Navbar.svelte';
	import ChatBot from '$lib/components/ChatBot.svelte';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let searchResults = $state<Array<{ path: string; title: string; chapter: string; score: number }>>([]);
	let isSearching = $state(false);
	let highlightTerms = $state<string[]>([]);
	let currentHighlightIndex = $state(0);
	let allHighlights: HTMLElement[] = $state([]);
	const pageTitle = $derived(`${data.book.name} - ${$t('app.title')}`);
	let sidebarOpen = $state(false);
	let chatbotVisible = $state(false);
	let chatbotWidth = $state(350);
	let isResizing = $state(false);

	// Flatten nav items to get ordered list of pages
	function flattenItems(items: NavItem[]): NavItem[] {
		const result: NavItem[] = [];
		for (const item of items) {
			if (item.path) result.push(item);
			if (item.children) result.push(...flattenItems(item.children));
		}
		return result;
	}

	const allPages = $derived(flattenItems(data.navigation));
	const currentPageIndex = $derived(allPages.findIndex((p) => p.path === data.currentPath));
	const prevPage = $derived(currentPageIndex > 0 ? allPages[currentPageIndex - 1] : null);
	const nextPage = $derived(
		currentPageIndex >= 0 && currentPageIndex < allPages.length - 1
			? allPages[currentPageIndex + 1]
			: null
	);

	function navigateTo(page: NavItem | null) {
		if (!page?.path) return;
		const urlPath = page.path.replace(/\.md$/, '');
		goto(`/books/${data.book.id}/${urlPath}`);
	}

	// Set chatbot visibility based on screen size on mount
	$effect(() => {
		if (typeof window !== 'undefined') {
			chatbotVisible = window.innerWidth >= 1024;
		}
	});

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let searchIndex: any = null;
	let searchDocuments: any[] = [];

	function toggleChatbot() {
		chatbotVisible = !chatbotVisible;
	}

	function startResize(e: MouseEvent) {
		isResizing = true;
		e.preventDefault();
	}

	$effect(() => {
		if (!isResizing) return;

		function handleMouseMove(e: MouseEvent) {
			if (!isResizing) return;
			const newWidth = window.innerWidth - e.clientX;
			chatbotWidth = Math.max(250, Math.min(600, newWidth));
		}

		function handleMouseUp() {
			isResizing = false;
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	// Apply highlights whenever content changes
	$effect(() => {
		data.htmlContent;
		data.currentPath;

		if (highlightTerms.length > 0) {
			setTimeout(async () => {
				if (!window.location.hash) {
					const wrapper = document.querySelector('.book-content-wrapper');
					if (wrapper) {
						wrapper.scrollTop = 0;
					}
				}

				highlightSearchTerms();
				await updateCurrentHighlight(true);
			}, 0);
		} else {
			if (!window.location.hash) {
				const wrapper = document.querySelector('.book-content-wrapper');
				if (wrapper) {
					wrapper.scrollTop = 0;
				}
			}
		}
	});

	// Load search index on mount
	$effect(() => {
		loadSearchIndex();
	});

	async function loadSearchIndex() {
		try {
			const response = await fetch(`/books/${data.book.id}/search-index.json`);

			if (!response.ok) {
				console.warn('Search index not available. Please contact admin to trigger a build.');
				return;
			}

			const indexData = await response.json();
			const lunr = (await import('lunr')).default;
			searchIndex = lunr.Index.load(indexData.index);
			searchDocuments = indexData.documents || [];
		} catch (err) {
			console.error('Failed to load search index:', err);
		}
	}

	async function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			highlightTerms = [];
			removeHighlights();
			return;
		}

		if (searchTimeout) clearTimeout(searchTimeout);

		searchTimeout = setTimeout(async () => {
			isSearching = true;
			try {
				if (!searchIndex) {
					await loadSearchIndex();
				}

				if (!searchIndex) {
					throw new Error('Search index not loaded');
				}

				const terms = searchQuery
					.trim()
					.split(/\s+/)
					.filter(Boolean);
				const wildcardQuery = terms.map((term) => `*${term}*`).join(' ');
				const results = searchIndex.search(wildcardQuery);

				searchResults = results
					.map((result: any) => {
						const doc = searchDocuments.find((d: any) => d.id === result.ref);
						return {
							path: result.ref,
							title: doc?.title || result.ref,
							chapter: doc?.chapter || '',
							score: result.score
						};
					})
					.slice(0, 10);

				highlightTerms = searchQuery
					.trim()
					.split(/\s+/)
					.filter(Boolean);
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

		const pattern = highlightTerms
			.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('|');
		const regex = new RegExp(`(${pattern})`, 'gi');

		const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT, null);

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
		allHighlights.forEach((el) => el.classList.remove('search-highlight-current'));

		if (allHighlights.length > 0 && currentHighlightIndex < allHighlights.length) {
			const current = allHighlights[currentHighlightIndex];
			current.classList.add('search-highlight-current');

			if (waitForImages) {
				const contentDiv = document.querySelector('.book-content');
				if (contentDiv) {
					const images = Array.from(contentDiv.querySelectorAll('img'));
					await Promise.all(
						images.map((img) => {
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
		currentHighlightIndex =
			(currentHighlightIndex - 1 + allHighlights.length) % allHighlights.length;
		updateCurrentHighlight();
	}

	function goToNextHighlight() {
		if (allHighlights.length === 0) return;
		currentHighlightIndex = (currentHighlightIndex + 1) % allHighlights.length;
		updateCurrentHighlight();
	}

	// Get set of filtered paths from search results
	const filteredPaths = $derived(
		searchResults.length > 0 ? new Set(searchResults.map((r) => r.path)) : null
	);

	function handleLinkClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const link = target.closest('a');

		if (!link) return;

		const href = link.getAttribute('href');
		if (!href) return;

		if (href.startsWith('#')) {
			e.preventDefault();
			const id = href.substring(1);
			const element = document.getElementById(id);
			if (element) {
				element.scrollIntoView({ behavior: 'auto', block: 'start' });
				history.replaceState(null, '', window.location.pathname + href);
			}
			return;
		}

		if (href.endsWith('.md') && !href.startsWith('http') && !href.startsWith('//')) {
			e.preventDefault();

			let targetPath = href.replace(/\.md$/, '');

			if (href.startsWith('../')) {
				const match = href.match(/^\.\.\/([^\/]+)\/(.*)\.md$/);
				if (match) {
					const [, bookId, path] = match;
					goto(`/books/${bookId}/${path}`);
					return;
				}
			}

			goto(`/books/${data.book.id}/${targetPath}`);
		}
	}

	// Check if a nav item or its children contain the active page
	function isItemActive(item: NavItem): boolean {
		if (item.path === data.currentPath) return true;
		if (item.children) return item.children.some(isItemActive);
		return false;
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="stylesheet" href="/book-viewer.css" />
</svelte:head>

<div class="book-viewer-wrapper">
	<Navbar {data} fullWidth />

	<div class="book-viewer">
		<!-- Sidebar overlay for mobile -->
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="sidebar-overlay" onclick={closeSidebar}></div>
		{/if}

		<div class="book-sidebar" class:open={sidebarOpen}>
			<div class="sidebar-header">
				<h3 class="toc-title">{$t('book.toc')}</h3>
				<button class="hamburger mobile-close" onclick={closeSidebar} aria-label="Close menu">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

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
				<nav class="toc-nav">
					{#each data.navigation as item}
						{#if item.isHeader}
							<div class="toc-section-header">{item.title}</div>
							{#if item.children}
								{#each item.children as child}
									{@const isActive = child.path === data.currentPath}
									{@const displayTitle = child.title === '__INTRODUCTION__' ? $t('book.introduction') : child.title}
									<a
										class="toc-link"
										class:active={isActive}
										href="/books/{data.book.id}/{child.path?.replace(/\.md$/, '') ?? ''}"
									>{displayTitle}</a>
									{#if child.children}
										{#each child.children as subchild}
											{@const isSubActive = subchild.path === data.currentPath}
											{@const subDisplayTitle = subchild.title === '__INTRODUCTION__' ? $t('book.introduction') : subchild.title}
											<a
												class="toc-link"
												class:active={isSubActive}
												href="/books/{data.book.id}/{subchild.path?.replace(/\.md$/, '') ?? ''}"
											>{subDisplayTitle}</a>
										{/each}
									{/if}
								{/each}
							{/if}
						{:else}
							{@const isActive = item.path === data.currentPath}
							{@const displayTitle = item.title === '__INTRODUCTION__' ? $t('book.introduction') : item.title}
							<a
								class="toc-link"
								class:active={isActive}
								href="/books/{data.book.id}/{item.path?.replace(/\.md$/, '') ?? ''}"
							>{displayTitle}</a>
						{/if}
					{/each}
				</nav>
			{/if}
		</div>

		<div class="book-right-container">
			<div class="book-main">
				{#if highlightTerms.length > 0 && allHighlights.length > 0}
					<div class="search-navigation">
						<button onclick={goToPrevHighlight} class="nav-button">
							← Previous
						</button>
						<span class="search-position">
							{currentHighlightIndex + 1} / {allHighlights.length}
						</span>
						<button onclick={goToNextHighlight} class="nav-button">
							Next →
						</button>
					</div>
				{/if}

				<div class="book-content-wrapper">
					<!-- Chapter navigation top -->
					<div class="chapter-nav">
						{#if prevPage}
							<button class="chapter-nav-btn" onclick={() => navigateTo(prevPage)}>
								{$t('book.prevChapter')}
							</button>
						{:else}
							<div></div>
						{/if}
						{#if nextPage}
							<button class="chapter-nav-btn" onclick={() => navigateTo(nextPage)}>
								{$t('book.nextChapter')}
							</button>
						{:else}
							<div></div>
						{/if}
					</div>

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="book-content" onclick={handleLinkClick}>
						{@html data.htmlContent}
					</div>
				</div>
			</div>

			{#if chatbotVisible}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="resize-handle"
					onmousedown={startResize}
					role="separator"
					aria-orientation="vertical"
				></div>
				<div class="book-chatbot" style="width: {chatbotWidth}px;">
					<ChatBot
						bookId={data.book.id}
						bookName={data.book.name}
						isVisible={chatbotVisible}
						onToggle={toggleChatbot}
					/>
				</div>
			{:else}
				<ChatBot
					bookId={data.book.id}
					bookName={data.book.name}
					isVisible={false}
					onToggle={toggleChatbot}
				/>
			{/if}
		</div>
	</div>

	<!-- Mobile sidebar toggle -->
	<button class="mobile-menu-btn" onclick={toggleSidebar} aria-label="Toggle menu">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="3" y1="12" x2="21" y2="12" />
			<line x1="3" y1="6" x2="21" y2="6" />
			<line x1="3" y1="18" x2="21" y2="18" />
		</svg>
	</button>
</div>
