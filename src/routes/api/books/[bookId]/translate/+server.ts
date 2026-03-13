import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bookExists } from '$lib/server/books';
import { preTranslateBook } from '$lib/server/translate';

/**
 * POST /api/books/:bookId/translate
 * Trigger pre-translation in background. Returns immediately.
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

	// Fire-and-forget: run in background, log errors
	if (targetLocale) {
		preTranslateBook(bookId, targetLocale).catch(err =>
			console.error(`[translate] Background translation failed for ${bookId} → ${targetLocale}:`, err)
		);
	} else {
		preTranslateBook(bookId, 'ko')
			.then(() => preTranslateBook(bookId, 'en'))
			.catch(err =>
				console.error(`[translate] Background translation failed for ${bookId}:`, err)
			);
	}

	return json({ status: 'started', bookId, locale: targetLocale || 'both' });
};
