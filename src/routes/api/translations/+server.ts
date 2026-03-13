import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTranslationLogs } from '$lib/server/db/translation-logs';

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();
	if (!session?.user || !(session.user as any).isChaekMember) {
		return new Response('Unauthorized', { status: 401 });
	}

	const bookId = url.searchParams.get('bookId') || undefined;
	const logs = await getTranslationLogs(bookId);
	return json(logs);
};
