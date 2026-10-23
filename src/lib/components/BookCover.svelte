<script lang="ts">
	import { locale } from '$lib/i18n';

	let { id, name, hasCover }: { id: string; name: string; hasCover?: boolean } = $props();

	function hashColor(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		const h = Math.abs(hash) % 360;
		return `hsl(${h}, 35%, 82%)`;
	}

	const coverColor = $derived(hashColor(id));
</script>

<!-- A book leaning back against the wall: the cover tilts away at the top,
     and a shadow behind it spreads wider toward the bottom -->
<div class="book">
	<span class="wall-shadow" aria-hidden="true"></span>
	<a href="/books/{id}" class="book-cover" style="background-color: {coverColor}" title={name}>
		{#if hasCover}
			<img src="/api/books/{id}/cover?lang={$locale}" alt={name} loading="lazy" />
		{:else}
			<span class="cover-title">{name}</span>
		{/if}
	</a>
</div>

<style>
	.book {
		--lean: 9deg;
		position: relative;
		width: 74%;
		margin: 0 auto;
		perspective: 900px;
		perspective-origin: 50% 0%;
	}

	/* Shadow on the wall behind the book: as wide as the book at the top,
	   where it touches the wall, and spreading wider and darker toward the
	   bottom. The trapezoid is clipped on the inner layer and blurred by the
	   outer one, so its edges stay soft. */
	.wall-shadow {
		position: absolute;
		inset: 3% -5% -1% -5%;
		filter: blur(7px);
		transform: translateX(3px);
	}

	.wall-shadow::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(60, 38, 18, 0.22), rgba(60, 38, 18, 0.5));
		/* top edge = book width (inset 3%), bottom spreads 5% past each side */
		clip-path: polygon(7.3% 0, 92.7% 0, 100% 100%, 0 100%);
	}

	.book-cover {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 2 / 3;
		border-radius: 2px 5px 5px 2px;
		overflow: hidden;
		text-decoration: none;
		transform-origin: 50% 100%;
		transform: rotateX(var(--lean));
		/* contact shadow where the book meets the shelf, plus a light edge */
		box-shadow:
			0 1px 1px rgba(40, 25, 10, 0.35),
			0 3px 4px -2px rgba(40, 25, 10, 0.45);
		transition: transform 0.25s ease;
	}

	/* Spine shading on the left edge, a faint top-light falloff that sells
	   the backward tilt, and a fine paper grain */
	.book-cover::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E"),
			linear-gradient(
				to right,
				rgba(0, 0, 0, 0.22),
				rgba(255, 255, 255, 0.18) 4%,
				rgba(0, 0, 0, 0.06) 9%,
				rgba(0, 0, 0, 0) 12%
			),
			linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0) 30%, rgba(255, 255, 255, 0.05));
		pointer-events: none;
	}

	/* Picking a book: it straightens up a little */
	.book:hover .book-cover {
		transform: rotateX(calc(var(--lean) * 0.35));
	}

	.book-cover:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 3px;
	}

	.book-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.cover-title {
		padding: 0 14% 0 18%;
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1.35;
		color: rgba(0, 0, 0, 0.7);
		text-align: center;
		word-break: keep-all;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		.book-cover {
			transition: none;
		}
	}
</style>
