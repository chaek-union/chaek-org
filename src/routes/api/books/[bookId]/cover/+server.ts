import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookCover } from '$lib/server/books';
import fs from 'fs/promises';
import path from 'path';

const CONTENT_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml'
};

/**
 * GET /api/books/:bookId/cover?lang=ko
 * Serve the cover image declared by the `cover` field in book.json.
 */
export const GET: RequestHandler = async ({ params, url, request }) => {
	const filePath = await getBookCover(params.bookId, url.searchParams.get('lang') ?? undefined);
	if (!filePath) {
		throw error(404, 'Cover not found');
	}

	const stats = await fs.stat(filePath);
	const etag = `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
	const headers = {
		'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()],
		'Cache-Control': 'public, max-age=3600',
		ETag: etag
	};

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(await fs.readFile(filePath), { headers });
};
