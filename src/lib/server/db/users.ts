import { query, queryOne } from './index.js';

export interface User {
	id: number;
	github_id: number;
	username: string;
	avatar_url: string | null;
	is_chaek_member: boolean;
	created_at: Date;
	updated_at: Date;
}

/**
 * Create or update user
 */
export async function upsertUser(
	githubId: number,
	username: string,
	avatarUrl: string | null,
	isChaekMember: boolean
): Promise<User> {
	const result = await queryOne<User>(
		`INSERT INTO users (github_id, username, avatar_url, is_chaek_member)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (github_id)
		DO UPDATE SET
			username = EXCLUDED.username,
			avatar_url = EXCLUDED.avatar_url,
			is_chaek_member = EXCLUDED.is_chaek_member,
			updated_at = CURRENT_TIMESTAMP
		RETURNING *`,
		[githubId, username, avatarUrl, isChaekMember]
	);
	return result!;
}

/**
 * Get user by GitHub ID
 */
export async function getUserByGithubId(githubId: number): Promise<User | null> {
	return queryOne<User>('SELECT * FROM users WHERE github_id = $1', [githubId]);
}

/**
 * Get user by internal ID
 */
export async function getUserById(id: number): Promise<User | null> {
	return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}
