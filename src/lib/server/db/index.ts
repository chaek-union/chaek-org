import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Initialize database with schema
 */
export async function initDatabase() {
	const client = await pool.connect();
	try {
		const schemaPath = path.join(process.cwd(), 'src/lib/server/db/schema.sql');
		const schema = await fs.readFile(schemaPath, 'utf-8');
		await client.query(schema);
		console.log('Database initialized successfully');
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
