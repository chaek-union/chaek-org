import { query, queryOne } from './index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
	id: number;
	name: string;
	applied_at: Date;
}

/**
 * Create migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
	await query(`
		CREATE TABLE IF NOT EXISTS migrations (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) UNIQUE NOT NULL,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<string[]> {
	const migrations = await query<Migration>('SELECT name FROM migrations ORDER BY id');
	return migrations.map(m => m.name);
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(name: string): Promise<void> {
	await query('INSERT INTO migrations (name) VALUES ($1)', [name]);
}

/**
 * Get all migration files from the migrations directory
 */
async function getMigrationFiles(): Promise<string[]> {
	const migrationsDir = path.join(process.cwd(), 'migrations');

	try {
		const files = await fs.readdir(migrationsDir);
		return files
			.filter(f => f.endsWith('.sql'))
			.sort(); // Sort alphabetically to ensure correct order
	} catch (error) {
		console.log('No migrations directory found');
		return [];
	}
}

/**
 * Run a single migration file
 */
async function runMigration(filePath: string, name: string): Promise<void> {
	console.log(`Running migration: ${name}`);
	const sql = await fs.readFile(filePath, 'utf-8');

	try {
		await query(sql);
		await markMigrationApplied(name);
		console.log(`✓ Migration ${name} applied successfully`);
	} catch (error) {
		console.error(`✗ Migration ${name} failed:`, error);
		throw error;
	}
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
	console.log('Checking for pending migrations...');

	// Ensure migrations table exists
	await ensureMigrationsTable();

	// Get applied and available migrations
	const appliedMigrations = await getAppliedMigrations();
	const migrationFiles = await getMigrationFiles();

	if (migrationFiles.length === 0) {
		console.log('No migration files found');
		return;
	}

	// Find pending migrations
	const pendingMigrations = migrationFiles.filter(
		file => !appliedMigrations.includes(file)
	);

	if (pendingMigrations.length === 0) {
		console.log('All migrations are up to date');
		return;
	}

	console.log(`Found ${pendingMigrations.length} pending migration(s)`);

	// Run each pending migration
	const migrationsDir = path.join(process.cwd(), 'migrations');
	for (const migration of pendingMigrations) {
		const filePath = path.join(migrationsDir, migration);
		await runMigration(filePath, migration);
	}

	console.log('All migrations completed successfully');
}
