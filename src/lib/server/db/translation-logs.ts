import { query, queryOne } from './index.js';

export interface TranslationLog {
	id: number;
	book_id: string;
	target_locale: string;
	status: 'running' | 'success' | 'failed';
	started_at: Date;
	completed_at: Date | null;
	triggered_by: string | null;
}

export interface TranslationLogLine {
	id: number;
	log_id: number;
	line_number: number;
	log_type: 'stdout' | 'stderr' | 'status';
	content: string;
	created_at: Date;
}

export async function createTranslationLog(
	bookId: string,
	targetLocale: string,
	triggeredBy?: string
): Promise<TranslationLog> {
	const result = await queryOne<TranslationLog>(
		`INSERT INTO translation_logs (book_id, target_locale, status, triggered_by)
		VALUES ($1, $2, 'running', $3)
		RETURNING *`,
		[bookId, targetLocale, triggeredBy || null]
	);
	return result!;
}

export async function updateTranslationLog(
	logId: number,
	status: 'success' | 'failed'
): Promise<void> {
	await query(
		`UPDATE translation_logs
		SET status = $1, completed_at = CURRENT_TIMESTAMP
		WHERE id = $2`,
		[status, logId]
	);
}

export async function getTranslationLogs(bookId?: string): Promise<TranslationLog[]> {
	if (bookId) {
		return query<TranslationLog>(
			'SELECT * FROM translation_logs WHERE book_id = $1 ORDER BY started_at DESC',
			[bookId]
		);
	}
	return query<TranslationLog>('SELECT * FROM translation_logs ORDER BY started_at DESC');
}

export async function getTranslationLogById(logId: number): Promise<TranslationLog | null> {
	return queryOne<TranslationLog>('SELECT * FROM translation_logs WHERE id = $1', [logId]);
}

export async function appendTranslationLogLine(
	logId: number,
	logType: 'stdout' | 'stderr' | 'status',
	content: string
): Promise<TranslationLogLine> {
	const result = await queryOne<{ max_line: number }>(
		'SELECT COALESCE(MAX(line_number), 0) as max_line FROM translation_log_lines WHERE log_id = $1',
		[logId]
	);
	const lineNumber = (result?.max_line || 0) + 1;

	const logLine = await queryOne<TranslationLogLine>(
		`INSERT INTO translation_log_lines (log_id, line_number, log_type, content)
		 VALUES ($1, $2, $3, $4)
		 RETURNING *`,
		[logId, lineNumber, logType, content]
	);
	return logLine!;
}

/**
 * Get latest translation status per book
 */
export async function getLatestTranslationStatuses(): Promise<{ book_id: string; status: string }[]> {
	return query<{ book_id: string; status: string }>(
		`SELECT DISTINCT ON (book_id) book_id, status
		FROM translation_logs
		ORDER BY book_id, started_at DESC`
	);
}

export async function getTranslationLogLines(logId: number): Promise<TranslationLogLine[]> {
	return query<TranslationLogLine>(
		`SELECT * FROM translation_log_lines
		 WHERE log_id = $1
		 ORDER BY line_number ASC`,
		[logId]
	);
}
