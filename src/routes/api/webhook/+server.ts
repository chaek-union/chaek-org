import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'crypto';
import { processBook } from '$lib/server/compiler';
import { isValidBookId } from '$lib/server/books';

const ALLOWED_ORG = 'chaek-union';

/**
 * Verify GitHub's X-Hub-Signature-256 header against the raw request body
 */
function verifySignature(body: Buffer, signature: string | null, secret: string): boolean {
	if (!signature?.startsWith('sha256=')) return false;
	const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Handle GitHub webhook POST requests
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const secret = env.GITHUB_WEBHOOK_SECRET;
		if (!secret) {
			console.error('GITHUB_WEBHOOK_SECRET is not configured; rejecting webhook');
			return json({ error: 'Webhook not configured' }, { status: 503 });
		}

		const body = Buffer.from(await request.arrayBuffer());
		if (!verifySignature(body, request.headers.get('x-hub-signature-256'), secret)) {
			console.warn('Rejected webhook with invalid signature');
			return json({ error: 'Invalid signature' }, { status: 401 });
		}

		const event = request.headers.get('x-github-event');

		// Parse payload
		const payload = JSON.parse(body.toString('utf-8'));

		// Only handle push events
		if (event !== 'push') {
			return json({ message: 'Event ignored' }, { status: 200 });
		}

		// Check if it's from the allowed organization
		const owner = payload.repository?.owner?.login || payload.repository?.owner?.name || '';
		const repoName = payload.repository?.name || '';
		if (owner !== ALLOWED_ORG) {
			console.log(`Ignoring push from ${owner}/${repoName} (not in ${ALLOWED_ORG})`);
			return json({ message: 'Repository not in allowed organization' }, { status: 200 });
		}

		if (!isValidBookId(repoName)) {
			return json({ error: 'Invalid repository name' }, { status: 400 });
		}

		// Never trust clone_url from the payload; always clone from the org
		const repoUrl = `https://github.com/${ALLOWED_ORG}/${repoName}.git`;

		console.log(`Received push event for ${repoName}`);

		// Process book asynchronously (don't block the webhook response)
		processBook(repoName, repoUrl)
			.then((result) => {
				if (result.success) {
					console.log(result.message);
				} else {
					console.error(result.message, result.error);
				}
			})
			.catch((error) => {
				console.error('Error processing book:', error);
			});

		return json({
			message: 'Webhook received, processing book...',
			repository: repoName
		});
	} catch (error) {
		console.error('Webhook error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Handle GET requests (for testing)
 */
export const GET: RequestHandler = async () => {
	return json({
		message: 'Webhook endpoint is active',
		organization: ALLOWED_ORG
	});
};
