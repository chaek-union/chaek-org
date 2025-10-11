import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import lunr from 'lunr';
import { createBuildLog, updateBuildLog } from './db/builds.js';
import { parseSummary, getBookRoot, getFilePaths } from './summary-parser.js';

const BOOKS_DIR = path.join(process.cwd(), 'books');
const STATIC_BOOKS_DIR = path.join(process.cwd(), 'static', 'books');

interface CompilationResult {
	success: boolean;
	message: string;
	error?: string;
	buildId?: number;
}

/**
 * Clone or update a repository
 */
async function syncRepository(repoName: string, repoUrl: string): Promise<void> {
	const repoPath = path.join(BOOKS_DIR, repoName);

	try {
		await fs.access(repoPath);
		// Repository exists, pull latest changes
		console.log(`Pulling latest changes for ${repoName}...`);
		const git = simpleGit(repoPath);
		await git.pull();
	} catch {
		// Repository doesn't exist, clone it
		console.log(`Cloning ${repoName}...`);
		await fs.mkdir(BOOKS_DIR, { recursive: true });
		const git = simpleGit();
		await git.clone(repoUrl, repoPath);
	}
}

/**
 * Build Lunr search index for a book
 */
async function buildSearchIndex(repoName: string, buildId: number): Promise<CompilationResult> {
	try {
		console.log(`Building search index for ${repoName}...`);

		// Get navigation and file paths
		const navigation = await parseSummary(repoName);
		const filePaths = getFilePaths(navigation);
		const bookRoot = await getBookRoot(repoName);

		console.log(`Found ${filePaths.length} files to index`);

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
					const title =
						titleMatch?.[1] || filePath.split('/').pop()?.replace('.md', '') || filePath;

					return {
						id: filePath,
						path: filePath,
						title,
						content: cleanContent
					};
				} catch (err) {
					console.error(`Error reading ${filePath}:`, err);
					return null;
				}
			})
		);

		// Filter out failed reads
		const validDocuments = documents.filter((doc) => doc !== null);

		console.log(`Successfully indexed ${validDocuments.length} documents`);

		// Build Lunr index
		const idx = lunr(function () {
			this.ref('id');
			this.field('title', { boost: 10 });
			this.field('content');

			validDocuments.forEach((doc) => {
				this.add(doc);
			});
		});

		// Save index to books directory
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

		const stdout = `Successfully built search index with ${validDocuments.length} documents`;
		await updateBuildLog(buildId, 'success', stdout, '');

		return {
			success: true,
			message: `Successfully built search index for ${repoName}`,
			buildId
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Error building search index for ${repoName}:`, errorMessage);

		await updateBuildLog(buildId, 'failed', '', '', errorMessage);

		return {
			success: false,
			message: `Failed to build search index for ${repoName}`,
			error: errorMessage,
			buildId
		};
	}
}

/**
 * Process a book: clone/update and build search index
 */
export async function processBook(
	repoName: string,
	repoUrl: string,
	triggeredBy?: number
): Promise<CompilationResult> {
	let buildId: number | undefined;

	try {
		// Create build log entry
		const buildLog = await createBuildLog(repoName, repoName, repoUrl, triggeredBy);
		buildId = buildLog.id;

		// Ensure directories exist
		await fs.mkdir(BOOKS_DIR, { recursive: true });
		await fs.mkdir(STATIC_BOOKS_DIR, { recursive: true });

		// Sync repository
		await syncRepository(repoName, repoUrl);

		// Build search index
		const result = await buildSearchIndex(repoName, buildId);

		return result;
	} catch (error) {
		console.error(`Error processing book ${repoName}:`, error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Update build log with error if we have a buildId
		if (buildId) {
			await updateBuildLog(buildId, 'failed', '', '', errorMessage);
		}

		return {
			success: false,
			message: `Error processing ${repoName}`,
			error: errorMessage,
			buildId
		};
	}
}

/**
 * Extract repository name from GitHub URL
 */
export function extractRepoName(repoUrl: string): string {
	const match = repoUrl.match(/github\.com\/[^\/]+\/([^\/\.]+)/);
	return match ? match[1] : '';
}
