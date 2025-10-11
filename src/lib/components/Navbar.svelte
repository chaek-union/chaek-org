<script lang="ts">
	import { t } from '$lib/i18n';
	import LanguageSwitcher from './LanguageSwitcher.svelte';

	let { data } = $props();

	const session = $derived(data?.session);
	const isChaekMember = $derived((session?.user as any)?.isChaekMember);
</script>

<nav class="navbar">
	<div class="navbar-container">
		<a href="/" class="navbar-brand">
			<span class="brand-icon">📚</span>
			<span class="brand-text">{$t('app.title')}</span>
		</a>
		<div class="navbar-actions">
			{#if isChaekMember}
				<a href="/builds" class="nav-link">{$t('nav.builds')}</a>
			{/if}

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
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
		z-index: 1000;
	}

	.navbar-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.navbar-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		color: #333;
		font-size: 1.5rem;
		font-weight: 700;
		transition: opacity 0.2s;
	}

	.navbar-brand:hover {
		opacity: 0.8;
	}

	.brand-icon {
		font-size: 1.8rem;
		line-height: 1;
	}

	.brand-text {
		line-height: 1;
	}

	.navbar-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-link {
		color: #333;
		text-decoration: none;
		font-weight: 500;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.nav-link:hover {
		background: #f8f9fa;
		color: #4285f4;
	}

	@media (max-width: 768px) {
		.navbar-container {
			padding: 0.75rem 1rem;
		}

		.navbar-brand {
			font-size: 1.25rem;
		}

		.brand-icon {
			font-size: 1.5rem;
		}

		.navbar-actions {
			gap: 0.5rem;
		}
	}
</style>
