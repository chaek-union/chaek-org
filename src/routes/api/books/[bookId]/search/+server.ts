import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSummary, getBookRoot, getFilePaths } from '$lib/server/summary-parser';
import fs from 'fs/promises';
import path from 'path';
import lunr from 'lunr';

/**
 * Build Lunr index for a book
 */
async function buildIndex(bookId: string, bookRoot: string, filePaths: string[]) {
	console.log(`[Search] Building index for ${bookId}...`);

	// Build documents for search
	const documents = await Promise.all(
		filePaths.map(async (filePath) => {
			try {
				const fullPath = path.join(bookRoot, filePath);
				const content = await fs.readFile(fullPath, 'utf-8');

				// Remove markdown syntax for better search
				const cleanContent = content
					.replace(/^#+\s+/gm, '') // Remove headers
					.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
					.replace(/[*_`]/g, '') // Remove emphasis markers
					.replace(/!\[[^\]]*\]\([^)]+\)/g, ''); // Remove images

				// Extract title from first heading or filename
				const titleMatch = content.match(/^#\s+(.+)$/m);
				const title = titleMatch?.[1] || filePath.split('/').pop()?.replace('.md', '') || filePath;

				return {
					id: filePath,
					path: filePath,
					title,
					content: cleanContent
				};
			} catch (err) {
				console.error(`[Search] Error reading ${filePath}:`, err);
				return null;
			}
		})
	);

	// Filter out failed reads
	const validDocuments = documents.filter((doc) => doc !== null);

	// Build Lunr index
	const idx = lunr(function () {
		this.ref('id');
		this.field('title', { boost: 10 });
		this.field('content');

		validDocuments.forEach((doc) => {
			this.add(doc);
		});
	});

	// Save index
	const indexPath = path.join(bookRoot, 'search-index.json');
	await fs.writeFile(
		indexPath,
		JSON.stringify({
			index: idx,
			documents: validDocuments.map((doc) => ({
				id: doc.id,
				path: doc.path,
				title: doc.title
			}))
		})
	);

	console.log(`[Search] Saved index with ${validDocuments.length} documents`);

	return { idx, documents: validDocuments };
}

export const GET: RequestHandler = async ({ params, url }) => {
	const { bookId } = params;
	const query = url.searchParams.get('q');

	if (!query) {
		return json({ results: [] });
	}

	try {
		const bookRoot = await getBookRoot(bookId);
		const indexPath = path.join(bookRoot, 'search-index.json');

		console.log(`[Search] BookId: ${bookId}, Query: ${query}`);

		let idx: lunr.Index;
		let documents: any[];

		// Try to load existing index
		try {
			const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
			idx = lunr.Index.load(indexData.index);
			documents = indexData.documents;
			console.log(`[Search] Loaded existing index with ${documents.length} documents`);
		} catch (err) {
			// Index doesn't exist, build it
			console.log(`[Search] Index not found, building...`);
			const navigation = await parseSummary(bookId);
			const filePaths = getFilePaths(navigation);
			const result = await buildIndex(bookId, bookRoot, filePaths);
			idx = result.idx;
			documents = result.documents;
		}

		// Build search query
		// For all terms: use wildcard matching
		// Fuzzy matching disabled to avoid false positives
		const searchQuery = query
			.split(/\s+/)
			.map((term) => `${term}*`)
			.join(' ');

		console.log(`[Search] Search query: ${searchQuery}`);

		const searchResults = idx.search(searchQuery);
		console.log(`[Search] Found ${searchResults.length} results`);

		const results = searchResults.slice(0, 10).map((result) => {
			const doc = documents.find((d) => d.id === result.ref);
			return {
				path: result.ref,
				title: doc?.title || result.ref,
				score: result.score
			};
		});

		return json({ results, query });
	} catch (err) {
		console.error('Search error:', err);
		return json({ results: [], error: String(err) }, { status: 500 });
	}
};
