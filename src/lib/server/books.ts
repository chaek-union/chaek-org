import fs from 'fs/promises';
import path from 'path';

export interface Book {
	id: string;
	name: string;
	description?: string;
	lastUpdated?: Date;
}

const BOOKS_DIR = path.join(process.cwd(), 'books');
const STATIC_BOOKS_DIR = path.join(process.cwd(), 'static', 'books');

/**
 * Get list of all available books
 */
export async function getBooks(): Promise<Book[]> {
	try {
		await fs.mkdir(BOOKS_DIR, { recursive: true });
		const entries = await fs.readdir(BOOKS_DIR, { withFileTypes: true });

		const books: Book[] = [];

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const bookPath = path.join(BOOKS_DIR, entry.name);
				const stats = await fs.stat(bookPath);

				// Check if compiled book exists
				const compiledPath = path.join(STATIC_BOOKS_DIR, entry.name, 'index.html');
				let isCompiled = false;
				try {
					await fs.access(compiledPath);
					isCompiled = true;
				} catch {
					// Book not yet compiled
				}

				if (isCompiled) {
					books.push({
						id: entry.name,
						name: entry.name.replace(/-/g, ' '),
						lastUpdated: stats.mtime
					});
				}
			}
		}

		return books.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
	} catch (error) {
		console.error('Error reading books directory:', error);
		return [];
	}
}

/**
 * Check if a book exists
 */
export async function bookExists(bookId: string): Promise<boolean> {
	try {
		const bookPath = path.join(BOOKS_DIR, bookId);
		await fs.access(bookPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get book metadata
 */
export async function getBookMetadata(bookId: string): Promise<Book | null> {
	try {
		const bookPath = path.join(BOOKS_DIR, bookId);
		const stats = await fs.stat(bookPath);

		return {
			id: bookId,
			name: bookId.replace(/-/g, ' '),
			lastUpdated: stats.mtime
		};
	} catch {
		return null;
	}
}
