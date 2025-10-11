import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processBook } from '$lib/server/compiler';
import { getBookMetadata } from '$lib/server/books';

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members to trigger builds
	if (!session?.user || !(session.user as any).isChaekMember) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { bookId } = await request.json();

		if (!bookId) {
			return json({ error: 'Book ID is required' }, { status: 400 });
		}

		// Get book metadata to construct repo URL
		const book = await getBookMetadata(bookId);
		if (!book) {
			return json({ error: 'Book not found' }, { status: 404 });
		}

		// Construct GitHub repo URL (assuming chaek-union organization)
		const repoUrl = `https://github.com/chaek-union/${bookId}.git`;

		// Get username from session
		const triggeredBy = (session.user as any).githubId || 'manual';

		// Trigger build asynchronously
		processBook(bookId, repoUrl, triggeredBy).catch(err => {
			console.error(`Failed to process book ${bookId}:`, err);
		});

		return json({ success: true, message: 'Build triggered successfully' });
	} catch (error) {
		console.error('Error triggering build:', error);
		return json({ error: 'Failed to trigger build' }, { status: 500 });
	}
};
