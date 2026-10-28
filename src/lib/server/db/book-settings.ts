import { query } from './index.js';

export interface BookSettings {
	isDraft: boolean;
	isHidden: boolean;
}

/** Admin-page overrides for one book; an unset field defers to book.json */
export type BookSettingsOverride = Partial<BookSettings>;

interface BookSettingsRow {
	book_id: string;
	is_draft: boolean | null;
	is_hidden: boolean | null;
}

function toOverride(row: BookSettingsRow): BookSettingsOverride {
	const o: BookSettingsOverride = {};
	if (row.is_draft !== null) o.isDraft = row.is_draft;
	if (row.is_hidden !== null) o.isHidden = row.is_hidden;
	return o;
}

/**
 * Get the admin-page overrides of every book that has any. Falls back to no
 * overrides if the database is unavailable, so book lists still render.
 */
export async function getAllBookSettings(): Promise<Map<string, BookSettingsOverride>> {
	try {
		const rows = await query<BookSettingsRow>(
			'SELECT book_id, is_draft, is_hidden FROM book_settings'
		);
		return new Map(rows.map((r) => [r.book_id, toOverride(r)]));
	} catch (error) {
		console.error('Failed to load book settings, using book.json values:', error);
		return new Map();
	}
}

// Per-book overrides cached briefly: every image of a page asks for them
const OVERRIDE_TTL_MS = 10_000;
const overrideCache = new Map<string, { value: BookSettingsOverride; expires: number }>();

/**
 * Admin-page override of one book ({} if none, or if the database is down)
 */
export async function getBookSettingsOverride(bookId: string): Promise<BookSettingsOverride> {
	const cached = overrideCache.get(bookId);
	if (cached && cached.expires > Date.now()) return cached.value;
	let value: BookSettingsOverride = {};
	try {
		const rows = await query<BookSettingsRow>(
			'SELECT book_id, is_draft, is_hidden FROM book_settings WHERE book_id = $1',
			[bookId]
		);
		if (rows[0]) value = toOverride(rows[0]);
	} catch (error) {
		console.error(`Failed to load settings for ${bookId}, using book.json values:`, error);
	}
	overrideCache.set(bookId, { value, expires: Date.now() + OVERRIDE_TTL_MS });
	return value;
}

/**
 * Effective settings of a book: admin-page override first, then the book's
 * own book.json flags (already on the book), which default to published and
 * visible.
 */
export function applyBookSettings<T extends BookSettings & { id: string }>(
	book: T,
	overrides: Map<string, BookSettingsOverride>
): T {
	return { ...book, ...overrides.get(book.id) };
}

/**
 * Override one or both settings of a book from the admin page.
 */
export async function updateBookSettings(
	bookId: string,
	changes: BookSettingsOverride,
	updatedBy?: string
): Promise<BookSettingsOverride> {
	const setDraft = 'isDraft' in changes;
	const setHidden = 'isHidden' in changes;
	const rows = await query<BookSettingsRow>(
		`INSERT INTO book_settings (book_id, is_draft, is_hidden, updated_by)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (book_id) DO UPDATE SET
		   is_draft = CASE WHEN $5 THEN EXCLUDED.is_draft ELSE book_settings.is_draft END,
		   is_hidden = CASE WHEN $6 THEN EXCLUDED.is_hidden ELSE book_settings.is_hidden END,
		   updated_by = EXCLUDED.updated_by,
		   updated_at = CURRENT_TIMESTAMP
		 RETURNING book_id, is_draft, is_hidden`,
		[
			bookId,
			changes.isDraft ?? null,
			changes.isHidden ?? null,
			updatedBy ?? null,
			setDraft,
			setHidden
		]
	);
	const value = toOverride(rows[0]);
	overrideCache.set(bookId, { value, expires: Date.now() + OVERRIDE_TTL_MS });
	return value;
}
