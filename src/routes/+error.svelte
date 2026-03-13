<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import Navbar from '$lib/components/Navbar.svelte';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'Something went wrong');
</script>

<svelte:head>
	<title>{status} - {$t('app.title')}</title>
</svelte:head>

<Navbar data={$page.data} />

<div class="error-page">
	<div class="error-content">
		<span class="error-code">{status}</span>
		<h1 class="error-message">{message}</h1>
		<a href="/" class="back-button">{$t('nav.backToList')}</a>
	</div>
</div>

<style>
	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: calc(100vh - 82px);
		padding: 2rem;
	}

	.error-content {
		text-align: center;
	}

	.error-code {
		font-size: 6rem;
		font-weight: 700;
		color: var(--color-primary);
		line-height: 1;
	}

	.error-message {
		margin: 1rem 0 2rem;
		font-size: 1.25rem;
		font-weight: 400;
		color: var(--text-secondary);
	}

	.back-button {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		background: var(--color-primary);
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 500;
		transition: background 0.2s;
	}

	.back-button:hover {
		background: var(--color-primary-hover);
	}
</style>
