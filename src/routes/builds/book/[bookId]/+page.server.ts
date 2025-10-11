import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members
	if (!session?.user || !(session.user as any).isChaekMember) {
		throw error(401, 'Unauthorized');
	}

	return {
		bookId: params.bookId
	};
};
