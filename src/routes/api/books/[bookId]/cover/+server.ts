import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookCover } from '$lib/server/books';
import { getCoverThumbnail } from '$lib/server/covers';
import { getBookAccess, bookCacheControl } from '$lib/server/book-access';
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
 * Serve a card-sized thumbnail of the cover declared by the `cover` field in
 * book.json, falling back to the original image if thumbnailing fails.
 */
export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	const access = await getBookAccess(params.bookId, locals);
	if (access === 'denied') {
		throw error(404, 'Cover not found');
	}

	const srcPath = await getBookCover(params.bookId, url.searchParams.get('lang') ?? undefined);
	if (!srcPath) {
		throw error(404, 'Cover not found');
	}

	let filePath = srcPath;
	try {
		filePath = await getCoverThumbnail(params.bookId, srcPath);
	} catch (err) {
		console.error(`Cover thumbnail failed for ${params.bookId}:`, err);
	}

	const stats = await fs.stat(filePath);
	const etag = `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
	const headers = {
		'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()],
		'Cache-Control': bookCacheControl(access),
		ETag: etag
	};

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(await fs.readFile(filePath), { headers });
};
