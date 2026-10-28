import { getBookFlags, isValidBookId } from './books';
import { getBookSettingsOverride } from './db/book-settings';

/**
 * Who may see a book's content:
 * - 'public'  : anyone (the book isn't hidden)
 * - 'private' : hidden, but the viewer is a signed-in member
 * - 'denied'  : hidden and the viewer isn't signed in
 */
export type BookAccess = 'public' | 'private' | 'denied';

export async function isBookHidden(bookId: string): Promise<boolean> {
	if (!isValidBookId(bookId)) return false;
	const [flags, override] = await Promise.all([getBookFlags(bookId), getBookSettingsOverride(bookId)]);
	return override.isHidden ?? flags.isHidden;
}

export async function getBookAccess(bookId: string, locals: App.Locals): Promise<BookAccess> {
	if (!(await isBookHidden(bookId))) return 'public';
	const session = await locals.auth();
	return (session?.user as any)?.isChaekMember ? 'private' : 'denied';
}

/** Cache-Control for a book's files: hidden books must not land in shared caches */
export function bookCacheControl(access: BookAccess): string {
	return access === 'public' ? 'public, max-age=3600' : 'private, max-age=3600';
}
