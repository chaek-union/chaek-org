import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getTranslationLogById } from '$lib/server/db/translation-logs';

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user || !(session.user as any).isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	const logId = parseInt(params.id);
	if (isNaN(logId)) {
		throw error(400, 'Invalid log ID');
	}

	const translationLog = await getTranslationLogById(logId);
	if (!translationLog) {
		throw error(404, 'Translation log not found');
	}

	return {
		logId,
		bookId: translationLog.book_id,
		targetLocale: translationLog.target_locale,
		initialStatus: translationLog.status
	};
};
