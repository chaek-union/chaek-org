<script lang="ts">
	import { t, locale } from '$lib/i18n';

	let {
		id,
		name,
		description,
		lastUpdated,
		hasPdf
	}: {
		id: string;
		name: string;
		description?: string;
		lastUpdated?: string | Date;
		hasPdf?: boolean;
	} = $props();

	function hashColor(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		const h = Math.abs(hash) % 360;
		return `hsl(${h}, 35%, 82%)`;
	}

	const coverColor = hashColor(id);

	const formattedDate = $derived(
		lastUpdated
			? new Date(lastUpdated).toLocaleDateString($locale === 'ko' ? 'ko-KR' : 'en-US')
			: null
	);
</script>

<div class="book-card">
	<div class="book-cover" style="background-color: {coverColor}">
		<span class="cover-icon">📖</span>
	</div>

	<div class="book-info">
		<h3 class="book-title">{hasPdf ? 'PDF' : ''}{name}</h3>

		{#if formattedDate}
			<p class="book-date">{$t('books.lastUpdated')}: {formattedDate}</p>
		{/if}

		<div class="book-badge">
			<svg width="14" height="14" viewBox="0 0 496 512" fill="currentColor">
				<path
					d="M245.8 214.9l-33.2 17.3c-9.4-19.6-25.2-20-27.4-20-22.2 0-33.3 14.6-33.3 46 0 30.8 10.3 46.3 33.1 46.3 8.3 0 25.7-4 31.6-24l34 11.6c-8.4 24.7-29.3 44-68 44-48.6 0-73.3-31.8-73.3-78 0-45.2 24.4-78 73.3-78 32.8 0 55.4 14.9 63.2 34.8zm130 0l-33.2 17.3c-9.4-19.6-25.2-20-27.4-20-22.2 0-33.3 14.6-33.3 46 0 30.8 10.3 46.3 33.1 46.3 8.3 0 25.7-4 31.6-24l34 11.6c-8.4 24.7-29.3 44-68 44-48.6 0-73.3-31.8-73.3-78 0-45.2 24.4-78 73.3-78 32.8 0 55.4 14.9 63.2 34.8zM248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200z"
				/>
			</svg>
			<span>{$t('books.openSource')}</span>
		</div>

		<div class="book-actions">
			<a href="/books/{id}" class="btn-read">{$t('books.readOnline')}</a>
			{#if hasPdf}
				<a
					href="/books/{id}/{id}.pdf"
					class="btn-download"
					target="_blank"
					rel="noopener noreferrer"
				>
					{$t('books.download')}
				</a>
			{:else}
				<button class="btn-download" disabled>{$t('books.download')}</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.book-card {
		display: flex;
		gap: 1rem;
		padding: 1.25rem;
		background: white;
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius);
		transition: box-shadow 0.2s, transform 0.2s;
	}

	.book-card:hover {
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		transform: translateY(-2px);
	}

	.book-cover {
		width: 80px;
		min-height: 100px;
		border-radius: 6px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
	}

	.book-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}

	.book-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-primary);
		text-transform: capitalize;
		line-height: 1.3;
	}

	.book-date {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.book-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--color-primary);
		background: var(--color-primary-light);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		width: fit-content;
	}

	.book-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.5rem;
	}

	.btn-read {
		flex: 1;
		text-align: center;
		padding: 0.5rem 0.75rem;
		border: 1.5px solid var(--color-primary);
		border-radius: 6px;
		color: var(--color-primary);
		background: transparent;
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-read:hover {
		background: var(--color-primary);
		color: white;
	}

	.btn-download {
		flex: 1;
		text-align: center;
		padding: 0.5rem 0.75rem;
		border: none;
		border-radius: 6px;
		background: var(--color-primary);
		color: white;
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}

	.btn-download:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-download:disabled {
		background: #ccc;
		cursor: not-allowed;
		opacity: 0.6;
	}

	@media (max-width: 768px) {
		.book-card {
			padding: 1rem;
		}

		.book-cover {
			width: 60px;
			min-height: 80px;
		}

		.book-title {
			font-size: 0.9rem;
		}

		.book-actions {
			flex-direction: column;
		}
	}
</style>
