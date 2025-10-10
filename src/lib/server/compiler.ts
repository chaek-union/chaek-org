import { spawn } from 'child_process';
import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';

const BOOKS_DIR = path.join(process.cwd(), 'books');
const STATIC_BOOKS_DIR = path.join(process.cwd(), 'static', 'books');

interface CompilationResult {
	success: boolean;
	message: string;
	error?: string;
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
 * Compile a HonKit book
 */
async function compileBook(repoName: string): Promise<CompilationResult> {
	const repoPath = path.join(BOOKS_DIR, repoName);
	const outputPath = path.join(STATIC_BOOKS_DIR, repoName);

	return new Promise((resolve) => {
		console.log(`Compiling ${repoName}...`);

		// Run npx honkit build
		const buildProcess = spawn('npx', ['honkit', 'build', '.', outputPath], {
			cwd: repoPath,
			shell: true
		});

		let stdout = '';
		let stderr = '';

		buildProcess.stdout?.on('data', (data) => {
			stdout += data.toString();
			console.log(`[${repoName}] ${data}`);
		});

		buildProcess.stderr?.on('data', (data) => {
			stderr += data.toString();
			console.error(`[${repoName}] ${data}`);
		});

		buildProcess.on('close', (code) => {
			if (code === 0) {
				resolve({
					success: true,
					message: `Successfully compiled ${repoName}`
				});
			} else {
				resolve({
					success: false,
					message: `Failed to compile ${repoName}`,
					error: stderr || stdout
				});
			}
		});

		buildProcess.on('error', (error) => {
			resolve({
				success: false,
				message: `Failed to compile ${repoName}`,
				error: error.message
			});
		});
	});
}

/**
 * Process a book: clone/update and compile
 */
export async function processBook(repoName: string, repoUrl: string): Promise<CompilationResult> {
	try {
		// Ensure directories exist
		await fs.mkdir(BOOKS_DIR, { recursive: true });
		await fs.mkdir(STATIC_BOOKS_DIR, { recursive: true });

		// Sync repository
		await syncRepository(repoName, repoUrl);

		// Compile book
		const result = await compileBook(repoName);

		return result;
	} catch (error) {
		console.error(`Error processing book ${repoName}:`, error);
		return {
			success: false,
			message: `Error processing ${repoName}`,
			error: error instanceof Error ? error.message : String(error)
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
