<script lang="ts">
	import type { PageData } from './$types';
	import type { NavItem } from '$lib/server/summary-parser';
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
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
		// Track data.htmlContent and currentPath to re-run when page changes
		data.htmlContent;
		data.currentPath;

		// Re-apply highlights if we have search terms
		if (highlightTerms.length > 0) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(async () => {
				// Only scroll to top if URL doesn't have an anchor
				if (!window.location.hash) {
					const wrapper = document.querySelector('.book-content-wrapper');
					if (wrapper) {
						wrapper.scrollTop = 0;
					}
				}

				highlightSearchTerms();

				// Scroll to first highlight after images loaded
				await updateCurrentHighlight(true);
			}, 0);
		} else {
			// No search active, scroll to top only if no anchor in URL
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

			// Import lunr dynamically
			const lunr = (await import('lunr')).default;

			// Load the pre-built index
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

		// Debounce search
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

				// Perform client-side search with Lunr using wildcards for partial matching
				// Add wildcard to each term for fuzzy matching
				const terms = searchQuery.trim().split(/\s+/).filter(Boolean);
				const wildcardQuery = terms.map(term => `*${term}*`).join(' ');
				const results = searchIndex.search(wildcardQuery);

				// Map results to our format
				searchResults = results.map((result: any) => {
					const doc = searchDocuments.find((d: any) => d.id === result.ref);
					return {
						path: result.ref,
						title: doc?.title || result.ref,
						chapter: doc?.chapter || '',
						score: result.score
					};
				}).slice(0, 10); // Limit to top 10 results

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
</svelte:head>

<div class="book-viewer-wrapper">
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

		<div class="book-right-container">
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

			{#if chatbotVisible}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="resize-handle" onmousedown={startResize} role="separator" aria-orientation="vertical"></div>
				<div class="book-chatbot" style="width: {chatbotWidth}px;">
					<ChatBot bookId={data.book.id} bookName={data.book.name} isVisible={chatbotVisible} onToggle={toggleChatbot} />
				</div>
			{:else}
				<ChatBot bookId={data.book.id} bookName={data.book.name} isVisible={false} onToggle={toggleChatbot} />
			{/if}
		</div>
	</div>
</div>