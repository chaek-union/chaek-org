import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bookExists } from '$lib/server/books';
import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'book-translations');

/**
 * POST /api/books/:bookId/clear-cache
 * Clear all translation cache for a book.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	const user = session?.user as any;
	if (!user?.isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const { bookId } = params;

	if (!await bookExists(bookId)) {
		throw error(404, 'Book not found');
	}

	const cacheDir = path.join(CACHE_DIR, bookId);
	try {
		await fs.rm(cacheDir, { recursive: true, force: true });
	} catch {
		// Directory may not exist
	}

	return json({ status: 'cleared', bookId });
};
