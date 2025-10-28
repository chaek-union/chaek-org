#!/usr/bin/env node
import { runMigrations } from '../src/lib/server/db/migrations.js';
import pg from 'pg';

const { Pool } = pg;

async function main() {
	console.log('Starting database migration...');

	// Create a temporary pool for migrations
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: false
	});

	try {
		// Test connection
		await pool.query('SELECT 1');
		console.log('Database connection established');

		// Run migrations
		await runMigrations();

		console.log('Migration completed successfully');
		process.exit(0);
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();
