import { query, queryOne } from './index.js';

export interface BuildLogLine {
	id: number;
	build_id: number;
	line_number: number;
	log_type: 'stdout' | 'stderr' | 'status';
	content: string;
	created_at: Date;
}

/**
 * Append a log line to a build
 */
export async function appendLogLine(
	buildId: number,
	logType: 'stdout' | 'stderr' | 'status',
	content: string
): Promise<BuildLogLine> {
	// Get the next line number
	const result = await queryOne<{ max_line: number }>(
		'SELECT COALESCE(MAX(line_number), 0) as max_line FROM build_log_lines WHERE build_id = $1',
		[buildId]
	);

	const lineNumber = (result?.max_line || 0) + 1;

	const logLine = await queryOne<BuildLogLine>(
		`INSERT INTO build_log_lines (build_id, line_number, log_type, content)
		 VALUES ($1, $2, $3, $4)
		 RETURNING *`,
		[buildId, lineNumber, logType, content]
	);

	return logLine!;
}

/**
 * Get all log lines for a build
 */
export async function getLogLines(buildId: number): Promise<BuildLogLine[]> {
	return query<BuildLogLine>(
		`SELECT * FROM build_log_lines
		 WHERE build_id = $1
		 ORDER BY line_number ASC`,
		[buildId]
	);
}

/**
 * Get log lines after a specific line number
 */
export async function getLogLinesAfter(buildId: number, afterLineNumber: number): Promise<BuildLogLine[]> {
	return query<BuildLogLine>(
		`SELECT * FROM build_log_lines
		 WHERE build_id = $1 AND line_number > $2
		 ORDER BY line_number ASC`,
		[buildId, afterLineNumber]
	);
}

/**
 * Get the latest line number for a build
 */
export async function getLatestLineNumber(buildId: number): Promise<number> {
	const result = await queryOne<{ max_line: number }>(
		'SELECT COALESCE(MAX(line_number), 0) as max_line FROM build_log_lines WHERE build_id = $1',
		[buildId]
	);
	return result?.max_line || 0;
}
