import { query, queryOne } from './index.js';

export interface PdfBuild {
	id: number;
	book_id: string;
	book_name: string;
	repo_url: string;
	status: 'running' | 'success' | 'failed';
	started_at: Date;
	completed_at: Date | null;
	pdf_path: string | null;
	error_message: string | null;
	triggered_by: string | null;
}

/**
 * Create a new PDF build log
 */
export async function createPdfBuild(
	bookId: string,
	bookName: string,
	repoUrl: string,
	triggeredBy?: string
): Promise<PdfBuild> {
	const result = await queryOne<PdfBuild>(
		`INSERT INTO pdf_builds (book_id, book_name, repo_url, status, triggered_by)
		VALUES ($1, $2, $3, 'running', $4)
		RETURNING *`,
		[bookId, bookName, repoUrl, triggeredBy || null]
	);
	return result!;
}

/**
 * Update PDF build with completion status
 */
export async function updatePdfBuild(
	buildId: number,
	status: 'success' | 'failed',
	pdfPath?: string,
	errorMessage?: string
): Promise<void> {
	await query(
		`UPDATE pdf_builds
		SET status = $1,
			completed_at = CURRENT_TIMESTAMP,
			pdf_path = $2,
			error_message = $3
		WHERE id = $4`,
		[status, pdfPath || null, errorMessage || null, buildId]
	);
}

/**
 * Get all PDF builds, optionally filtered by book_id
 */
export async function getPdfBuilds(bookId?: string): Promise<PdfBuild[]> {
	if (bookId) {
		return query<PdfBuild>(
			'SELECT * FROM pdf_builds WHERE book_id = $1 ORDER BY started_at DESC',
			[bookId]
		);
	}
	return query<PdfBuild>('SELECT * FROM pdf_builds ORDER BY started_at DESC');
}

/**
 * Get latest successful PDF build for a book
 */
export async function getLatestSuccessfulPdfBuild(bookId: string): Promise<PdfBuild | null> {
	return queryOne<PdfBuild>(
		`SELECT * FROM pdf_builds
		WHERE book_id = $1 AND status = 'success'
		ORDER BY completed_at DESC
		LIMIT 1`,
		[bookId]
	);
}

/**
 * Get PDF build by ID
 */
export async function getPdfBuildById(buildId: number): Promise<PdfBuild | null> {
	return queryOne<PdfBuild>('SELECT * FROM pdf_builds WHERE id = $1', [buildId]);
}
