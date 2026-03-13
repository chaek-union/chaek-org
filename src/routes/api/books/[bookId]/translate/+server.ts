import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bookExists } from '$lib/server/books';
import { preTranslateBook } from '$lib/server/translate';

/**
 * POST /api/books/:bookId/translate
 * Manually trigger pre-translation for a book. Admin (chaek-union member) only.
 * Waits for translation to complete and returns the result.
 * Body (optional): { "locale": "ko" | "en" }
 * If no locale specified, translates to both ko and en.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.auth();
	if (!(session?.user as any)?.isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const { bookId } = params;

	if (!await bookExists(bookId)) {
		throw error(404, 'Book not found');
	}

	let targetLocale: 'ko' | 'en' | null = null;
	try {
		const body = await request.json();
		if (body.locale === 'ko' || body.locale === 'en') {
			targetLocale = body.locale;
		}
	} catch {
		// No body or invalid JSON — translate both
	}

	try {
		if (targetLocale) {
			await preTranslateBook(bookId, targetLocale);
		} else {
			await preTranslateBook(bookId, 'ko');
			await preTranslateBook(bookId, 'en');
		}
		return json({ status: 'completed', bookId, locale: targetLocale || 'both' });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ status: 'failed', bookId, error: message }, { status: 500 });
	}
};
