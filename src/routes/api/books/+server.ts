import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBooks } from '$lib/server/books';

export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members to view books list
	if (!session?.user || !(session.user as any).isChaekMember) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const books = await getBooks();
		return json(books);
	} catch (error) {
		console.error('Error fetching books:', error);
		return json({ error: 'Failed to fetch books' }, { status: 500 });
	}
};
