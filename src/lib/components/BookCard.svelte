<script lang="ts">
	import { t, locale } from '$lib/i18n';

	export let id: string;
	export let name: string;
	export let description: string | undefined = undefined;
	export let lastUpdated: string | undefined = undefined;
	export let hasPdf: boolean | undefined = false;
</script>

<div class="book-card-wrapper">
	<a href="/books/{id}" class="book-card">
		<div class="card-content">
			<h3>{name}</h3>
			{#if description}
				<p class="description">{description}</p>
			{/if}
			{#if lastUpdated}
				<p class="updated">
					{$t('books.lastUpdated')}: {new Date(lastUpdated).toLocaleDateString(
						$locale === 'ko' ? 'ko-KR' : 'en-US'
					)}
				</p>
			{/if}
		</div>
		<div class="card-arrow">
			<svg
				width="20"
				height="20"
				viewBox="0 0 20 20"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M7.5 15L12.5 10L7.5 5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</div>
	</a>
	{#if hasPdf}
		<a href="/books/{id}/{id}.pdf" class="pdf-button" target="_blank" rel="noopener noreferrer">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M8 11L4 7h2.5V1h3v6H12L8 11z" fill="currentColor"/>
				<path d="M14 14H2v-2h12v2z" fill="currentColor"/>
			</svg>
			PDF
		</a>
	{:else}
		<button class="pdf-button disabled" disabled>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M8 11L4 7h2.5V1h3v6H12L8 11z" fill="currentColor"/>
				<path d="M14 14H2v-2h12v2z" fill="currentColor"/>
			</svg>
			PDF
		</button>
	{/if}
</div>

<style>
	.book-card-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
	}

	.book-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		border: 1px solid #e0e0e0;
		border-radius: 12px;
		text-decoration: none;
		color: inherit;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		background: white;
		position: relative;
		overflow: hidden;
		flex: 1;
	}

	.book-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, #4285f4, #34a853);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.book-card:hover::before {
		transform: scaleX(1);
	}

	.book-card:hover {
		border-color: #4285f4;
		box-shadow: 0 8px 24px rgba(66, 133, 244, 0.15);
		transform: translateY(-4px);
	}

	.book-card:hover .card-arrow {
		transform: translateX(4px);
		color: #4285f4;
	}

	.card-content {
		flex: 1;
	}

	.book-card h3 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.25rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.book-card .description {
		color: #666;
		margin: 0 0 0.75rem 0;
		line-height: 1.6;
		font-size: 0.95rem;
	}

	.book-card .updated {
		margin: 0;
		font-size: 0.85rem;
		color: #999;
	}

	.card-arrow {
		color: #ccc;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		flex-shrink: 0;
	}

	.pdf-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #4285f4;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s;
		align-self: flex-start;
	}

	.pdf-button:hover:not(.disabled) {
		background: #3367d6;
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(66, 133, 244, 0.3);
	}

	.pdf-button.disabled {
		background: #ccc;
		cursor: not-allowed;
		opacity: 0.6;
	}

	@media (max-width: 768px) {
		.book-card {
			padding: 1.25rem;
		}

		.book-card h3 {
			font-size: 1.1rem;
		}

		.book-card .description {
			font-size: 0.9rem;
		}

		.pdf-button {
			font-size: 0.85rem;
			padding: 0.45rem 0.85rem;
		}
	}
</style>
