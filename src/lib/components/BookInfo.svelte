<script lang="ts">
	import { t } from '$lib/i18n';

	let {
		id,
		name,
		lastUpdated,
		hasPdf
	}: {
		id: string;
		name: string;
		lastUpdated?: string | Date;
		hasPdf?: boolean;
	} = $props();

	// YYYY.MM.DD keeps the date on one line in narrow columns
	const formattedDate = $derived.by(() => {
		if (!lastUpdated) return null;
		const d = new Date(lastUpdated);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
	});
</script>

<div class="book-info">
	<span class="hanger hanger-left" aria-hidden="true"></span>
	<span class="hanger hanger-right" aria-hidden="true"></span>

	<h3 class="book-title" title={name}>
		<a href="/books/{id}">{name}</a>
	</h3>

	{#if formattedDate}
		<p class="book-date">{$t('books.lastUpdated')} {formattedDate}</p>
	{/if}

	<div class="book-actions">
		<a href="/books/{id}" class="btn-read">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M2 4.5c2.8-1 5.8-1 9 1v14c-3.2-2-6.2-2-9-1z" />
				<path d="M22 4.5c-2.8-1-5.8-1-9 1v14c3.2-2 6.2-2 9-1z" />
			</svg>
			{$t('books.readOnline')}
		</a>
		{#if hasPdf}
			<a
				href="/books/{id}/{id}.pdf"
				class="btn-pdf"
				target="_blank"
				rel="noopener noreferrer"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />
				</svg>
				{$t('books.download')}
			</a>
		{:else}
			<button class="btn-pdf" disabled>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />
				</svg>
				{$t('books.download')}
			</button>
		{/if}
	</div>
</div>

<style>
	/* Paper name plate hanging from the shelf above: smooth white copy paper
	   (barely-there grain), a touch darker at the bottom,
	   casting a soft shadow down and
	   to the right onto the wall (same light as the books) */
	.book-info {
		position: relative;
		min-width: 0;
		padding: 0.75rem 0.5rem 0.8rem;
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .4 0 0 0 0 .38 0 0 0 0 .35 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E"),
			linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(120, 100, 80, 0.04)),
			#ffffff;
		border: 1px solid rgba(90, 70, 50, 0.08);
		border-radius: 10px;
		box-shadow:
			0 1px 1px rgba(60, 38, 18, 0.12),
			3px 6px 10px -3px rgba(50, 30, 14, 0.32),
			8px 16px 26px -10px rgba(50, 30, 14, 0.36);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.hanger {
		position: absolute;
		/* tucks a few px behind the shelf so it always looks attached */
		top: -14px;
		width: 2px;
		height: 20px;
		background: #b88a57;
		border-radius: 1px;
	}

	.hanger::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -2px;
		width: 6px;
		height: 6px;
		transform: translateX(-50%);
		border-radius: 50%;
		background: #9c7144;
	}

	.hanger-left {
		left: 20%;
	}

	.hanger-right {
		right: 20%;
	}

	/* Always two lines tall so dates and buttons line up along the shelf;
	   one-line titles sit at the bottom, right above their date */
	.book-title {
		--title-size: 0.92rem;
		--title-line: 1.35;
		height: calc(2 * var(--title-line) * var(--title-size));
		margin: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		width: 100%;
		font-size: var(--title-size);
		font-weight: 600;
		line-height: var(--title-line);
	}

	.book-title a {
		color: var(--text-primary);
		text-decoration: none;
		word-break: keep-all;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.book-title a:hover {
		color: var(--color-primary);
	}

	.book-date {
		margin: 0.2rem 0 0;
		font-size: 0.74rem;
		color: var(--text-muted);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.book-actions {
		display: flex;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}

	.btn-read,
	.btn-pdf {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		height: 28px;
		padding: 0 0.8rem;
		border-radius: 999px;
		background: transparent;
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}

	.btn-read {
		border: 1.5px solid var(--color-primary);
		color: var(--color-primary);
	}

	.btn-read:hover {
		background: var(--color-primary);
		color: white;
	}

	.btn-pdf {
		border: 1.5px solid var(--border-color);
		color: var(--text-secondary);
	}

	.btn-pdf:hover:not(:disabled) {
		border-color: var(--text-secondary);
		color: var(--text-primary);
	}

	.btn-pdf:disabled {
		color: #b8b8b8;
		border-color: #ececec;
		cursor: not-allowed;
	}

	.btn-read svg {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	.btn-pdf svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.btn-read:focus-visible,
	.btn-pdf:focus-visible,
	.book-title a:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
