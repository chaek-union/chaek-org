<script lang="ts">
	import { t, locale } from '$lib/i18n';

	export let id: string;
	export let name: string;
	export let description: string | undefined = undefined;
	export let lastUpdated: string | undefined = undefined;
</script>

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

<style>
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
	}
</style>
