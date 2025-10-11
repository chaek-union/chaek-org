import { error } from '@sveltejs/kit';
import { getBookMetadata } from '$lib/server/books';
import { parseSummary, getBookRoot } from '$lib/server/summary-parser';
import type { PageServerLoad } from './$types';
import fs from 'fs/promises';
import path from 'path';
import { compile } from 'mdsvex';

export const load: PageServerLoad = async ({ params }) => {
	const book = await getBookMetadata(params.bookId);

	if (!book) {
		throw error(404, '교재를 찾을 수 없습니다');
	}

	// Parse SUMMARY.md to get navigation
	const navigation = await parseSummary(params.bookId);

	// Get book root directory
	const bookRoot = await getBookRoot(params.bookId);

	// Get the page path from URL path parameter, default to README.md
	let pagePath = params.path || 'README.md';

	// Add .md extension if not present
	if (!pagePath.endsWith('.md')) {
		pagePath = pagePath + '.md';
	}

	const filePath = path.join(bookRoot, pagePath);

	let htmlContent = '';

	try {
		// Read the markdown file
		const markdown = await fs.readFile(filePath, 'utf-8');

		// Compile markdown to HTML using mdsvex
		const result = await compile(markdown, {
			rehypePlugins: [
				(await import('rehype-slug')).default,
				[(await import('rehype-autolink-headings')).default, { behavior: 'wrap' }]
			]
		});

		if (result && result.code) {
			// Extract the HTML content from the compiled Svelte component
			// The compiled code contains the HTML in the markup section
			const htmlMatch = result.code.match(/<div[^>]*>([\s\S]*)<\/div>/);
			if (htmlMatch) {
				htmlContent = htmlMatch[0];
			} else {
				// Fallback: use the whole compiled result
				htmlContent = result.code;
			}

			// Rewrite relative paths to be absolute from book root
			// Get the directory of the current page
			const pageDir = path.dirname(pagePath);

			// Replace relative image paths
			htmlContent = htmlContent.replace(
				/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/g,
				(match, prefix, src, suffix) => {
					// Skip absolute URLs and data URIs
					if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) {
						return match;
					}

					// Resolve relative path from page directory
					const absolutePath = path.join(pageDir, src).replace(/\\/g, '/');
					return `${prefix}${absolutePath}${suffix}`;
				}
			);

			// Replace relative link paths (for CSS, JS, etc.)
			htmlContent = htmlContent.replace(
				/(<link[^>]+href=["'])([^"']+)(["'][^>]*>)/g,
				(match, prefix, href, suffix) => {
					if (href.startsWith('http') || href.startsWith('//') || href.startsWith('/')) {
						return match;
					}
					const absolutePath = path.join(pageDir, href).replace(/\\/g, '/');
					return `${prefix}${absolutePath}${suffix}`;
				}
			);
		}
	} catch (err) {
		console.error('Error loading markdown:', err);
		throw error(404, 'Page not found');
	}

	return {
		book,
		htmlContent,
		navigation,
		currentPath: pagePath
	};
};
