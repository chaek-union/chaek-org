<script lang="ts">
	import { locale, setLocale, t, type Locale } from '$lib/i18n';

	function switchLanguage(lang: Locale) {
		setLocale(lang);
	}
</script>

<div class="language-switcher">
	<button
		class:active={$locale === 'ko'}
		on:click={() => switchLanguage('ko')}
		aria-label="Switch to Korean"
	>
		{$t('language.korean')}
	</button>
	<span class="separator">|</span>
	<button
		class:active={$locale === 'en'}
		on:click={() => switchLanguage('en')}
		aria-label="Switch to English"
	>
		{$t('language.english')}
	</button>
</div>

<style>
	.language-switcher {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	button {
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: all 0.2s;
		font-family: inherit;
		font-size: inherit;
	}

	button:hover {
		background: #f0f0f0;
		color: #333;
	}

	button.active {
		color: #4285f4;
		font-weight: 600;
	}

	.separator {
		color: #ccc;
		user-select: none;
	}
</style>
