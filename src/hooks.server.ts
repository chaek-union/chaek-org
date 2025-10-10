import type { Handle } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Serve files from static/books directory
	if (pathname.startsWith('/books/')) {
		// Extract the path after /books/
		const bookPath = pathname.slice(7); // Remove '/books/'
		const filePath = path.join(process.cwd(), 'static', 'books', bookPath);

		try {
			// Check if file exists
			const stats = await fs.promises.stat(filePath);

			if (stats.isFile()) {
				const content = await fs.promises.readFile(filePath);

				// Determine content type based on file extension
				const ext = path.extname(filePath).toLowerCase();
				const contentTypes: Record<string, string> = {
					'.html': 'text/html',
					'.css': 'text/css',
					'.js': 'application/javascript',
					'.json': 'application/json',
					'.png': 'image/png',
					'.jpg': 'image/jpeg',
					'.jpeg': 'image/jpeg',
					'.gif': 'image/gif',
					'.svg': 'image/svg+xml',
					'.ico': 'image/x-icon',
					'.woff': 'font/woff',
					'.woff2': 'font/woff2',
					'.ttf': 'font/ttf',
					'.eot': 'application/vnd.ms-fontobject'
				};

				const contentType = contentTypes[ext] || 'application/octet-stream';

				return new Response(content, {
					headers: {
						'Content-Type': contentType,
						'Cache-Control': 'public, max-age=3600'
					}
				});
			}
		} catch (error) {
			// File not found or error reading, continue to default handler
		}
	}

	// Let SvelteKit handle the request normally
	return resolve(event);
};
