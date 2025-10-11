import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import { env } from '$env/dynamic/private';
import { Octokit } from '@octokit/rest';
import { upsertUser, getUserByGithubId } from '$lib/server/db/users';
import { initDatabase } from '$lib/server/db';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize database on server start
initDatabase().catch(console.error);

const GITHUB_ID = env.GITHUB_ID || '';
const GITHUB_SECRET = env.GITHUB_SECRET || '';
const AUTH_SECRET = env.AUTH_SECRET || '';

/**
 * Check if user is member of chaek-union organization
 */
async function isChaekMember(accessToken: string, username: string): Promise<boolean> {
	try {
		const octokit = new Octokit({ auth: accessToken });
		const { data: memberships } = await octokit.orgs.getMembershipForAuthenticatedUser({
			org: 'chaek-union'
		});
		return memberships.state === 'active';
	} catch (error) {
		console.log(`User ${username} is not a member of chaek-union`);
		return false;
	}
}

// Auth handler
const { handle: authHandle } = SvelteKitAuth({
	providers: [
		GitHub({
			clientId: GITHUB_ID,
			clientSecret: GITHUB_SECRET,
			authorization: {
				params: {
					scope: 'read:user read:org'
				}
			}
		})
	],
	secret: AUTH_SECRET,
	trustHost: true,
	callbacks: {
		async signIn({ user, account, profile }) {
			if (!account?.access_token || !profile) return false;

			const githubId = String(profile.id);
			const username = profile.login as string;
			const avatarUrl = profile.avatar_url as string;

			// Check organization membership - reject if not a member
			const isMember = await isChaekMember(account.access_token, username);
			if (!isMember) {
				return false;
			}

			// Store/update user in database (only for members)
			await upsertUser(githubId, username, avatarUrl, true);

			return true;
		},
		async jwt({ token, profile }) {
			// Store GitHub ID in JWT token during sign in
			if (profile?.id) {
				token.githubId = String(profile.id);
			}
			return token;
		},
		async session({ session, token }) {
			// Add GitHub ID from token to session
			if (token?.githubId) {
				(session.user as any).githubId = token.githubId;
				// All authenticated users are chaek-union members
				(session.user as any).isChaekMember = true;
			}
			return session;
		}
	}
});

// Dev session handler - bypass auth in dev mode
const devSessionHandle: Handle = async ({ event, resolve }) => {
	if (env.NODE_ENV === 'development') {
		// Override auth() to return mock session in dev mode
		event.locals.auth = async () => ({
			user: {
				name: 'Dev User',
				email: 'dev@localhost',
				image: 'https://github.com/ghost.png',
				githubId: 'dev-user',
				isChaekMember: true
			},
			expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
		});
	}
	return resolve(event);
};

// Static file serving handler
const staticFileHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Serve PDFs and search indexes from static/books directory
	if (pathname.startsWith('/books/') && (pathname.endsWith('.pdf') || pathname.endsWith('search-index.json'))) {
		const filePath = path.join(process.cwd(), 'static', pathname);

		try {
			const stats = await fs.promises.stat(filePath);

			if (stats.isFile()) {
				const content = await fs.promises.readFile(filePath);
				const contentType = pathname.endsWith('.pdf') ? 'application/pdf' : 'application/json';

				return new Response(content, {
					headers: {
						'Content-Type': contentType,
						'Cache-Control': 'public, max-age=3600'
					}
				});
			}
		} catch (error) {
			// File not found, continue to default handler
		}
	}

	// Serve assets from books directory (e.g., /books/{bookId}/assets/...)
	if (pathname.startsWith('/books/') && pathname.includes('/assets/')) {
		// Extract book ID and asset path
		const match = pathname.match(/^\/books\/([^\/]+)\/(.+)$/);
		if (match) {
			const [, bookId, assetPath] = match;

			// Import getBookRoot dynamically
			const { getBookRoot } = await import('$lib/server/summary-parser');
			const bookRoot = await getBookRoot(bookId);

			const filePath = path.join(bookRoot, assetPath);

			try {
				// Check if file exists
				const stats = await fs.promises.stat(filePath);

				if (stats.isFile()) {
					const content = await fs.promises.readFile(filePath);

					// Determine content type based on file extension
					const ext = path.extname(filePath).toLowerCase();
					const contentTypes: Record<string, string> = {
						'.html': 'text/html',
						'.css': 'text/css',
						'.js': 'application/javascript',
						'.json': 'application/json',
						'.png': 'image/png',
						'.jpg': 'image/jpeg',
						'.jpeg': 'image/jpeg',
						'.gif': 'image/gif',
						'.svg': 'image/svg+xml',
						'.ico': 'image/x-icon',
						'.woff': 'font/woff',
						'.woff2': 'font/woff2',
						'.ttf': 'font/ttf',
						'.eot': 'application/vnd.ms-fontobject',
						'.webp': 'image/webp'
					};

					const contentType = contentTypes[ext] || 'application/octet-stream';

					return new Response(content, {
						headers: {
							'Content-Type': contentType,
							'Cache-Control': 'public, max-age=3600'
						}
					});
				}
			} catch (error) {
				// File not found or error reading, continue to default handler
			}
		}
	}

	// Let SvelteKit handle the request normally
	return resolve(event);
};

// Combine handlers
export const handle = sequence(authHandle, devSessionHandle, staticFileHandle);
