import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bookExists } from '$lib/server/books';
import { preTranslateBook } from '$lib/server/translate';

/**
 * POST /api/books/:bookId/translate
 * Manually trigger pre-translation for a book.
 * Body (optional): { "locale": "ko" | "en" }
 * If no locale specified, translates to both ko and en.
 */
export const POST: RequestHandler = async ({ params, request }) => {
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

	if (targetLocale) {
		// Fire and forget
		preTranslateBook(bookId, targetLocale).catch(console.error);
	} else {
		preTranslateBook(bookId, 'ko').catch(console.error);
		preTranslateBook(bookId, 'en').catch(console.error);
	}

	return json({ status: 'started', bookId, locale: targetLocale || 'both' });
};
