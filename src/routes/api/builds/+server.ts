import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBuildLogs, getBooksWithLatestBuild } from '$lib/server/db/builds';

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members to view build logs
	if (!session?.user || !(session.user as any).isChaekMember) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const bookId = url.searchParams.get('bookId');
	const latest = url.searchParams.get('latest') === 'true';

	try {
		if (latest) {
			const builds = await getBooksWithLatestBuild();
			return json(builds);
		} else if (bookId) {
			const builds = await getBuildLogs(bookId);
			return json(builds);
		} else {
			const builds = await getBuildLogs();
			return json(builds);
		}
	} catch (error) {
		console.error('Error fetching build logs:', error);
		return json({ error: 'Failed to fetch build logs' }, { status: 500 });
	}
};
