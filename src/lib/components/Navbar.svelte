<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import LanguageSwitcher from './LanguageSwitcher.svelte';

	let { data } = $props();

	const session = $derived(data?.session);
	const isChaekMember = $derived((session?.user as any)?.isChaekMember);
	const logoSrc = $derived($locale === 'ko' ? '/chaek-logo-kr.png' : '/chaek-logo-en.png');
</script>

<nav class="navbar">
	<div class="navbar-container">
		<div class="navbar-brand">
			<img src={logoSrc} alt={$t('app.title')} class="brand-logo" />
			<a href="/" class="logo-link logo-link-left" aria-label={$t('app.title')}></a>
			<a href="https://kasra.kr" target="_blank" rel="noopener noreferrer" class="logo-link logo-link-right" aria-label="KASRA"></a>
		</div>
		<div class="navbar-actions">
			{#if isChaekMember}
				<a href="/builds" class="nav-link">{$t('nav.builds')}</a>
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
	}

	.navbar-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0.75rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.navbar-brand {
		position: relative;
		display: flex;
		align-items: center;
	}

	.brand-logo {
		height: 40px;
		width: auto;
	}

	.logo-link {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.logo-link-left {
		left: 0;
		width: 55%;
	}

	.logo-link-right {
		right: 0;
		width: 45%;
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

		.brand-logo {
			height: 32px;
		}

		.hide-mobile {
			display: none;
		}

		.navbar-actions {
			gap: 0.25rem;
		}
	}
</style>
