<script lang="ts">
	import { locale, setLocale, t, type Locale } from '$lib/i18n';

	let isOpen = $state(false);

	function switchLanguage(lang: Locale) {
		setLocale(lang);
		isOpen = false;
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function closeDropdown() {
		isOpen = false;
	}

	$effect(() => {
		if (isOpen) {
			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.language-switcher')) {
					closeDropdown();
				}
			};
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	const languageIcon = '🌐';
	const currentLanguage = $derived($locale === 'ko' ? '한국어' : 'English');
</script>

<div class="language-switcher">
	<button class="dropdown-trigger" onclick={toggleDropdown} aria-label="Select language">
		<span class="icon">{languageIcon}</span>
		<span class="current-lang">{currentLanguage}</span>
		<svg
			class="chevron"
			class:open={isOpen}
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M4 6L8 10L12 6"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	{#if isOpen}
		<div class="dropdown-menu">
			<button
				class="dropdown-item"
				class:active={$locale === 'ko'}
				onclick={() => switchLanguage('ko')}
			>
				한국어
			</button>
			<button
				class="dropdown-item"
				class:active={$locale === 'en'}
				onclick={() => switchLanguage('en')}
			>
				English
			</button>
		</div>
	{/if}
</div>

<style>
	.language-switcher {
		position: relative;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: white;
		border: 1px solid #e0e0e0;
		color: #333;
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		transition: all 0.2s;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.dropdown-trigger:hover {
		border-color: #4285f4;
		background: #f8f9fa;
	}

	.icon {
		font-size: 1.1rem;
		line-height: 1;
	}

	.current-lang {
		font-weight: 500;
	}

	.chevron {
		transition: transform 0.2s;
		color: #666;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		min-width: 120px;
		overflow: hidden;
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: block;
		width: 100%;
		background: none;
		border: none;
		color: #333;
		cursor: pointer;
		padding: 0.75rem 1rem;
		text-align: left;
		transition: all 0.15s;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.dropdown-item:hover {
		background: #f8f9fa;
	}

	.dropdown-item.active {
		color: #4285f4;
		font-weight: 600;
		background: #f0f7ff;
	}

	@media (max-width: 1024px) {
		.current-lang {
			display: none;
		}

		.chevron {
			display: none;
		}

		.dropdown-trigger {
			padding: 0.5rem;
			min-width: auto;
		}
	}
</style>
