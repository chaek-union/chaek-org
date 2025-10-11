import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBuildLogById } from '$lib/server/db/builds';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members to view build logs
	if (!session?.user || !(session.user as any).isChaekMember) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const buildId = parseInt(params.id);

	if (isNaN(buildId)) {
		return json({ error: 'Invalid build ID' }, { status: 400 });
	}

	try {
		const build = await getBuildLogById(buildId);

		if (!build) {
			return json({ error: 'Build not found' }, { status: 404 });
		}

		return json(build);
	} catch (error) {
		console.error('Error fetching build log:', error);
		return json({ error: 'Failed to fetch build log' }, { status: 500 });
	}
};
