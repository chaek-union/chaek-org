import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processBook, extractRepoName } from '$lib/server/compiler';

const ALLOWED_ORG = 'chaek-union';

/**
 * Handle GitHub webhook POST requests
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const event = request.headers.get('x-github-event');
		const body = await request.text();

		// Parse payload
		const payload = JSON.parse(body);

		// Only handle push events
		if (event !== 'push') {
			return json({ message: 'Event ignored' }, { status: 200 });
		}

		// Check if it's from the allowed organization
		const repoFullName = payload.repository?.full_name || '';
		if (!repoFullName.startsWith(`${ALLOWED_ORG}/`)) {
			console.log(`Ignoring push from ${repoFullName} (not in ${ALLOWED_ORG})`);
			return json({ message: 'Repository not in allowed organization' }, { status: 200 });
		}

		const repoUrl = payload.repository?.clone_url;
		const repoName = extractRepoName(repoUrl);

		if (!repoName) {
			return json({ error: 'Invalid repository URL' }, { status: 400 });
		}

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
		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
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
