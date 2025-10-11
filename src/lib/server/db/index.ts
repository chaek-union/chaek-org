import pg from 'pg';
import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: false
});

const SCHEMA_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_chaek_member BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Build logs table (for search index builds)
CREATE TABLE IF NOT EXISTS build_logs (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL,
    book_name VARCHAR(255) NOT NULL,
    repo_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'running', 'success', 'failed'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    triggered_by VARCHAR(255) REFERENCES users(github_id),
    CONSTRAINT valid_status CHECK (status IN ('running', 'success', 'failed'))
);

-- Build log lines table (stores each log line)
CREATE TABLE IF NOT EXISTS build_log_lines (
    id SERIAL PRIMARY KEY,
    build_id INTEGER NOT NULL REFERENCES build_logs(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    log_type VARCHAR(10) NOT NULL, -- 'stdout', 'stderr', 'status'
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(build_id, line_number)
);

-- PDF builds table
CREATE TABLE IF NOT EXISTS pdf_builds (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL,
    book_name VARCHAR(255) NOT NULL,
    repo_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'running', 'success', 'failed'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    pdf_path TEXT,
    error_message TEXT,
    triggered_by VARCHAR(255) REFERENCES users(github_id),
    CONSTRAINT valid_pdf_status CHECK (status IN ('running', 'success', 'failed'))
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_build_logs_book_id ON build_logs(book_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_status ON build_logs(status);
CREATE INDEX IF NOT EXISTS idx_build_logs_started_at ON build_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_log_lines_build_id ON build_log_lines(build_id, line_number);
CREATE INDEX IF NOT EXISTS idx_build_log_lines_created_at ON build_log_lines(created_at);
CREATE INDEX IF NOT EXISTS idx_pdf_builds_book_id ON pdf_builds(book_id);
CREATE INDEX IF NOT EXISTS idx_pdf_builds_status ON pdf_builds(status);
CREATE INDEX IF NOT EXISTS idx_pdf_builds_started_at ON pdf_builds(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Discover and clone book repositories from chaek-union organization
 */
async function discoverAndCloneBooks() {
	const BOOKS_DIR = path.join(process.cwd(), 'books');

	try {
		// Check if books directory is empty
		await fs.mkdir(BOOKS_DIR, { recursive: true });
		const entries = await fs.readdir(BOOKS_DIR);

		if (entries.length > 0) {
			console.log('Books directory not empty, skipping auto-discovery');
			return;
		}

		console.log('No books found, discovering repositories from chaek-union...');

		// Create Octokit instance (no auth needed for public repos)
		const octokit = new Octokit();

		// Get all repositories from chaek-union organization
		const { data: repos } = await octokit.repos.listForOrg({
			org: 'chaek-union',
			type: 'public',
			per_page: 100
		});

		console.log(`Found ${repos.length} repositories in chaek-union`);

		// Check each repository for book.json or SUMMARY.md
		const bookRepos: Array<{ name: string; cloneUrl: string }> = [];

		for (const repo of repos) {
			try {
				console.log(`Checking repository: ${repo.name}`);

				// Check if repository has book.json in root
				let hasBookJson = false;
				let hasSummary = false;

				try {
					await octokit.repos.getContent({
						owner: 'chaek-union',
						repo: repo.name,
						path: 'book.json'
					});
					hasBookJson = true;
					console.log(`  - Found book.json in ${repo.name}`);
				} catch {
					// book.json not found, check for SUMMARY.md
					try {
						await octokit.repos.getContent({
							owner: 'chaek-union',
							repo: repo.name,
							path: 'SUMMARY.md'
						});
						hasSummary = true;
						console.log(`  - Found SUMMARY.md in ${repo.name}`);
					} catch {
						console.log(`  - No book.json or SUMMARY.md found in ${repo.name}`);
					}
				}

				if ((hasBookJson || hasSummary) && repo.clone_url) {
					bookRepos.push({ name: repo.name, cloneUrl: repo.clone_url });
				} else if (hasBookJson || hasSummary) {
					console.log(`  - Skipping ${repo.name}: no clone_url`);
				}
			} catch (error) {
				console.error(`Error checking repository ${repo.name}:`, error);
			}
		}

		console.log(`Found ${bookRepos.length} book repositories to clone`);

		// Clone and build all book repositories asynchronously (don't block server startup)
		if (bookRepos.length > 0) {
			const { processBook } = await import('../compiler.js');

			// Process books in the background without waiting
			for (const book of bookRepos) {
				console.log(`Starting background build for: ${book.name}`);
				processBook(book.name, book.cloneUrl).catch(err =>
					console.error(`Failed to process ${book.name}:`, err)
				);
			}
		}

		console.log('Book discovery completed');
	} catch (error) {
		console.error('Error during book discovery:', error);
	}
}

/**
 * Initialize database with schema
 */
export async function initDatabase() {
	const client = await pool.connect();
	try {
		await client.query(SCHEMA_SQL);
		console.log('Database initialized successfully');

		// Create dev user if in development mode
		if (process.env.NODE_ENV === 'development') {
			await client.query(`
				INSERT INTO users (github_id, username, avatar_url, is_chaek_member)
				VALUES ('dev-user', 'Dev User', 'https://github.com/ghost.png', true)
				ON CONFLICT (github_id) DO NOTHING
			`);
			console.log('Dev user ensured in database');
		}

		// Discover and clone books if none exist
		await discoverAndCloneBooks();
	} catch (error) {
		console.error('Failed to initialize database:', error);
		throw error;
	} finally {
		client.release();
	}
}

/**
 * Get database pool instance
 */
export function getDb() {
	return pool;
}

/**
 * Query helper
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
	const result = await pool.query(text, params);
	return result.rows;
}

/**
 * Query single row helper
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
	const result = await pool.query(text, params);
	return result.rows[0] || null;
}
