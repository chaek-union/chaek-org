<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { onMount } from 'svelte';
	import LanguageSwitcher from './LanguageSwitcher.svelte';

	let {
		data,
		fullWidth = false,
		bookId = '',
		overlay = false
	}: { data: any; fullWidth?: boolean; bookId?: string; overlay?: boolean } = $props();

	const session = $derived(data?.session);
	const isChaekMember = $derived((session?.user as any)?.isChaekMember);
	const logoBase = $derived($locale === 'ko' ? '/chaek-logo-kr' : '/chaek-logo-en');

	// In overlay mode the bar is transparent over the page's hero and turns
	// white once the page has scrolled.
	let nav: HTMLElement;
	let logo: HTMLImageElement;
	let scrolled = $state(false);

	const logoSrc = $derived(overlay && !scrolled ? `${logoBase}-white.png` : `${logoBase}.png`);

	// Svelte keeps the server-rendered src on hydration even when it differs
	// (the server always renders the default locale), so set it on the client
	$effect(() => {
		if (logo && logo.getAttribute('src') !== logoSrc) logo.src = logoSrc;
	});

	onMount(() => {
		if (!overlay) return;
		// Pages scroll inside the layout's .content element, not the window
		const scroller: HTMLElement | Window = nav.closest<HTMLElement>('.content') ?? window;
		const update = () => {
			const top = scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
			scrolled = top > 8;
		};
		update();
		scroller.addEventListener('scroll', update, { passive: true });
		return () => scroller.removeEventListener('scroll', update);
	});
</script>

<nav class="navbar" class:overlay class:scrolled bind:this={nav}>
	<div class="navbar-container" class:full-width={fullWidth}>
		<div class="navbar-brand">
			<!-- Over the hero the white-ink version is shown (white areas transparent) -->
			<img src={logoSrc} alt={$t('app.title')} class="brand-logo" bind:this={logo} />
			<a href="/" class="logo-link logo-link-left" aria-label={$t('app.title')}></a>
			<a href="https://kasra.kr" target="_blank" rel="noopener noreferrer" class="logo-link logo-link-right" aria-label="KASRA"></a>
		</div>
		<div class="navbar-actions">
			{#if isChaekMember}
				<a href="/builds" class="nav-link">{$t('nav.builds')}</a>
			{/if}
			{#if bookId}
				<a
					href="https://github.com/chaek-union/{bookId}/issues"
					target="_blank"
					rel="noopener noreferrer"
					class="nav-link report-link"
				>
					{$t('nav.reportIssue')}
				</a>
			{/if}
			<a
				href="https://github.com/chaek-union"
				target="_blank"
				rel="noopener noreferrer"
				class="nav-link hide-mobile"
			>
				{$t('nav.contribute')}
			</a>

<LanguageSwitcher />
		</div>
	</div>
</nav>

<style>
	.navbar {
		position: sticky;
		top: 0;
		width: 100%;
		background: white;
		border-bottom: 1px solid #e0e0e0;
		z-index: 1000;
		transition:
			background 0.25s,
			border-color 0.25s,
			box-shadow 0.25s;
	}

	/* Overlay mode: sits on top of the hero (the page pulls the hero up under
	   it) until the page scrolls */
	.navbar.overlay {
		--navbar-h: 83px;
		margin-bottom: calc(-1 * var(--navbar-h));
	}

	.navbar.overlay:not(.scrolled) {
		background: transparent;
		border-bottom-color: transparent;
	}

	.navbar.overlay.scrolled {
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
	}

	.navbar.overlay:not(.scrolled) .brand-logo {
		filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.35));
	}

	.navbar.overlay:not(.scrolled) .nav-link {
		color: white;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.navbar.overlay:not(.scrolled) .nav-link:hover {
		background: rgba(255, 255, 255, 0.16);
		color: white;
	}

	.navbar.overlay:not(.scrolled) :global(.dropdown-trigger) {
		background: rgba(255, 255, 255, 0.14);
		border-color: rgba(255, 255, 255, 0.55);
		color: white;
	}

	.navbar.overlay:not(.scrolled) :global(.dropdown-trigger .chevron) {
		color: white;
	}

	/* the globe is a colour emoji, so whiten it with a filter */
	.navbar.overlay:not(.scrolled) :global(.dropdown-trigger .icon) {
		filter: grayscale(1) brightness(0) invert(1);
	}

	.navbar.overlay:not(.scrolled) :global(.dropdown-trigger:hover) {
		background: rgba(255, 255, 255, 0.24);
	}

	.navbar-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.navbar-container.full-width {
		max-width: none;
	}

	.navbar-brand {
		position: relative;
		display: flex;
		align-items: center;
	}

	.brand-logo {
		height: 50px;
		width: auto;
	}

	.logo-link {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.logo-link-left {
		left: 0;
		width: 62%;
	}

	.logo-link-right {
		right: 0;
		width: 38%;
	}

	.navbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-link {
		color: var(--text-primary);
		text-decoration: none;
		font-weight: 500;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		transition: all 0.2s;
		font-size: 0.9rem;
	}

	.nav-link:hover {
		background: #f8f9fa;
		color: var(--color-primary);
	}

@media (max-width: 768px) {
		.navbar-container {
			padding: 0.6rem 1rem;
		}

		.navbar.overlay {
			--navbar-h: 57px;
		}

		.nav-link {
			white-space: nowrap;
		}

		.brand-logo {
			height: 36px;
		}

		.hide-mobile {
			display: none;
		}

		.navbar-actions {
			gap: 0.25rem;
		}
	}
	/* Very narrow phones: a smaller logo and tighter links keep the bar on one
	   line at the same 57px height the overlay hero assumes */
	@media (max-width: 400px) {
		.brand-logo {
			height: 28px;
		}

		.nav-link {
			padding: 0.4rem 0.45rem;
			font-size: 0.82rem;
		}
	}
</style>
