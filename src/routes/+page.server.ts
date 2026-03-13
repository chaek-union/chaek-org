import { getBooks } from '$lib/server/books';
import { translateText } from '$lib/server/translate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const books = await getBooks();
	const userLocale = cookies.get('locale') as 'ko' | 'en' | undefined;

	if (userLocale === 'ko' || userLocale === 'en') {
		await Promise.all(
			books.map(async (book) => {
				book.name = await translateText(book.id, book.name, userLocale, 'title');
			})
		);
	}

	return {
		books
	};
};
