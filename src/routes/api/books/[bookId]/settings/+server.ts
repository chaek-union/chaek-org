import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookMetadata } from '$lib/server/books';
import {
	updateBookSettings,
	applyBookSettings,
	type BookSettingsOverride
} from '$lib/server/db/book-settings';

/**
 * PATCH /api/books/:bookId/settings
 * Body: { "isDraft"?: boolean, "isHidden"?: boolean }
 * Members only. Overrides the book.json values; returns the effective settings.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.auth();
	const user = session?.user as any;
	if (!user?.isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const { bookId } = params;
	const book = await getBookMetadata(bookId);
	if (!book) {
		throw error(404, 'Book not found');
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const changes: BookSettingsOverride = {};
	for (const key of ['isDraft', 'isHidden'] as const) {
		if (key in body) {
			if (typeof body[key] !== 'boolean') throw error(400, `${key} must be a boolean`);
			changes[key] = body[key];
		}
	}
	if (Object.keys(changes).length === 0) {
		throw error(400, 'Nothing to update');
	}

	const override = await updateBookSettings(bookId, changes, user.githubId);
	const { isDraft, isHidden } = applyBookSettings(book, new Map([[bookId, override]]));
	return json({ bookId, isDraft, isHidden });
};
