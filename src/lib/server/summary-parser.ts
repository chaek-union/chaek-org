import fs from 'fs/promises';
import path from 'path';
import { BOOKS_DIR } from './books';

export interface NavItem {
	title: string;
	path?: string;
	children?: NavItem[];
	isHeader?: boolean;
}

interface BookJson {
	title?: string;
	root?: string;
}

/**
 * Get book root directory from book.json
 */
export async function getBookRoot(bookId: string): Promise<string> {
	const bookJsonPath = path.join(BOOKS_DIR, bookId, 'book.json');
	try {
		const content = await fs.readFile(bookJsonPath, 'utf-8');
		const bookJson: BookJson = JSON.parse(content);
		const root = bookJson.root || '.';
		return path.join(BOOKS_DIR, bookId, root);
	} catch {
		// If book.json doesn't exist or can't be parsed, default to book root
		return path.join(BOOKS_DIR, bookId);
	}
}

/**
 * Parse SUMMARY.md file to extract navigation structure
 */
export async function parseSummary(bookId: string): Promise<NavItem[]> {
	const bookRoot = await getBookRoot(bookId);
	const summaryPath = path.join(bookRoot, 'SUMMARY.md');

	try {
		const content = await fs.readFile(summaryPath, 'utf-8');
		const lines = content.split('\n');
		const items: NavItem[] = [];
		const stack: { level: number; item: NavItem }[] = [];

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines and the main title
			if (!trimmed || trimmed === '# Summary') continue;

			// Check if it's a header (##)
			const headerMatch = trimmed.match(/^##\s+(.+)$/);
			if (headerMatch) {
				const headerItem: NavItem = {
					title: headerMatch[1],
					isHeader: true,
					children: []
				};
				items.push(headerItem);
				stack.length = 0;
				stack.push({ level: 0, item: headerItem });
				continue;
			}

			// Check if it's a list item (* [Title](path))
			const listMatch = trimmed.match(/^(\s*)\*\s+\[([^\]]+)\]\(([^)]+)\)$/);
			if (listMatch) {
				const [, indent, title, filePath] = listMatch;
				const level = indent.length / 2; // Assuming 2 spaces per level

				const navItem: NavItem = {
					title,
					path: filePath
				};

				if (level === 0) {
					// Top-level item
					if (stack.length > 0 && stack[0].item.isHeader) {
						// Add to current header's children
						stack[0].item.children!.push(navItem);
					} else {
						// Add to root
						items.push(navItem);
					}
					stack.length = 1;
					stack[0] = { level, item: navItem };
				} else {
					// Nested item
					while (stack.length > 0 && stack[stack.length - 1].level >= level) {
						stack.pop();
					}

					if (stack.length > 0) {
						const parent = stack[stack.length - 1].item;
						if (!parent.children) parent.children = [];
						parent.children.push(navItem);
					}

					stack.push({ level, item: navItem });
				}
			}
		}

		// Remove any existing README.md entries from the navigation
		function removeReadme(navItems: NavItem[]): void {
			for (let i = navItems.length - 1; i >= 0; i--) {
				const item = navItems[i];
				if (item.path === 'README.md') {
					navItems.splice(i, 1);
				} else if (item.children) {
					removeReadme(item.children);
				}
			}
		}
		removeReadme(items);

		// Prepend Introduction (README.md) at the top
		// Use special title marker __INTRODUCTION__ for client-side translation
		items.unshift({
			title: '__INTRODUCTION__',
			path: 'README.md'
		});

		return items;
	} catch (err) {
		console.error(`Failed to parse SUMMARY.md for ${bookId}:`, err);
		return [];
	}
}

/**
 * Get flat list of all markdown file paths from navigation
 */
export function getFilePaths(navItems: NavItem[]): string[] {
	const paths: string[] = [];

	function traverse(items: NavItem[]) {
		for (const item of items) {
			if (item.path) {
				paths.push(item.path);
			}
			if (item.children) {
				traverse(item.children);
			}
		}
	}

	traverse(navItems);
	return paths;
}
