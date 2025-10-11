import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getBuildLogById } from '$lib/server/db/builds';

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members
	if (!session?.user || !(session.user as any).isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const buildId = parseInt(params.id);

	if (isNaN(buildId)) {
		throw error(400, 'Invalid build ID');
	}

	const buildLog = await getBuildLogById(buildId);

	if (!buildLog) {
		throw error(404, 'Build not found');
	}

	return {
		buildId,
		initialStatus: buildLog.status
	};
};
