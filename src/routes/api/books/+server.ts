import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBooks } from '$lib/server/books';
import { getBooksWithLatestBuild } from '$lib/server/db/builds';
import { getLatestTranslationStatuses } from '$lib/server/db/translation-logs';

export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members to view books list
	if (!session?.user || !(session.user as any).isChaekMember) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const [books, latestBuilds, latestTranslations] = await Promise.all([
			getBooks(),
			getBooksWithLatestBuild(),
			getLatestTranslationStatuses()
		]);

		const buildStatusMap = new Map(latestBuilds.map(b => [b.book_id, b.status]));
		const translationMap = new Map(latestTranslations.map(t => [t.book_id, { status: t.status, completedAt: t.completed_at }]));

		const booksWithStatus = books.map(book => {
			const translation = translationMap.get(book.id);
			return {
				...book,
				latestBuildStatus: buildStatusMap.get(book.id) || null,
				latestTranslationStatus: translation?.status || null,
				lastTranslatedAt: translation?.completedAt || null
			};
		});

		return json(booksWithStatus);
	} catch (error) {
		console.error('Error fetching books:', error);
		return json({ error: 'Failed to fetch books' }, { status: 500 });
	}
};
