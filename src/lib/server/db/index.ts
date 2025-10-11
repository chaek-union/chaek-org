import pg from 'pg';

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

-- Build logs table
CREATE TABLE IF NOT EXISTS build_logs (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL,
    book_name VARCHAR(255) NOT NULL,
    repo_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'running', 'success', 'failed'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    stdout TEXT,
    stderr TEXT,
    error_message TEXT,
    triggered_by VARCHAR(255) REFERENCES users(github_id),
    CONSTRAINT valid_status CHECK (status IN ('running', 'success', 'failed'))
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_build_logs_book_id ON build_logs(book_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_status ON build_logs(status);
CREATE INDEX IF NOT EXISTS idx_build_logs_started_at ON build_logs(started_at DESC);
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
 * Initialize database with schema
 */
export async function initDatabase() {
	const client = await pool.connect();
	try {
		await client.query(SCHEMA_SQL);
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
