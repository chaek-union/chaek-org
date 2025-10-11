import { query, queryOne } from './index.js';

export interface BuildLog {
	id: number;
	book_id: string;
	book_name: string;
	repo_url: string;
	status: 'running' | 'success' | 'failed';
	started_at: Date;
	completed_at: Date | null;
	stdout: string | null;
	stderr: string | null;
	error_message: string | null;
	triggered_by: string | null;
}

/**
 * Create a new build log
 */
export async function createBuildLog(
	bookId: string,
	bookName: string,
	repoUrl: string,
	triggeredBy?: string
): Promise<BuildLog> {
	const result = await queryOne<BuildLog>(
		`INSERT INTO build_logs (book_id, book_name, repo_url, status, triggered_by)
		VALUES ($1, $2, $3, 'running', $4)
		RETURNING *`,
		[bookId, bookName, repoUrl, triggeredBy || null]
	);
	return result!;
}

/**
 * Update build log with completion status
 */
export async function updateBuildLog(
	buildId: number,
	status: 'success' | 'failed',
	stdout?: string,
	stderr?: string,
	errorMessage?: string
): Promise<void> {
	await query(
		`UPDATE build_logs
		SET status = $1,
			completed_at = CURRENT_TIMESTAMP,
			stdout = $2,
			stderr = $3,
			error_message = $4
		WHERE id = $5`,
		[status, stdout || null, stderr || null, errorMessage || null, buildId]
	);
}

/**
 * Get all build logs, optionally filtered by book_id
 */
export async function getBuildLogs(bookId?: string): Promise<BuildLog[]> {
	if (bookId) {
		return query<BuildLog>(
			'SELECT * FROM build_logs WHERE book_id = $1 ORDER BY started_at DESC',
			[bookId]
		);
	}
	return query<BuildLog>('SELECT * FROM build_logs ORDER BY started_at DESC');
}

/**
 * Get latest build log for a book
 */
export async function getLatestBuildLog(bookId: string): Promise<BuildLog | null> {
	return queryOne<BuildLog>(
		'SELECT * FROM build_logs WHERE book_id = $1 ORDER BY started_at DESC LIMIT 1',
		[bookId]
	);
}

/**
 * Get build log by ID
 */
export async function getBuildLogById(buildId: number): Promise<BuildLog | null> {
	return queryOne<BuildLog>('SELECT * FROM build_logs WHERE id = $1', [buildId]);
}

/**
 * Get all unique books with their latest build
 */
export async function getBooksWithLatestBuild(): Promise<BuildLog[]> {
	return query<BuildLog>(
		`SELECT DISTINCT ON (book_id) *
		FROM build_logs
		ORDER BY book_id, started_at DESC`
	);
}
