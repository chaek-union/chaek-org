import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTranslationLogById } from '$lib/server/db/translation-logs';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user || !(session.user as any).isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const logId = parseInt(params.id);
	const log = await getTranslationLogById(logId);
	if (!log) throw error(404, 'Not found');

	return json({ status: log.status });
};
