import { getBooks } from '$lib/server/books';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const books = await getBooks();
	return {
		books
	};
};
