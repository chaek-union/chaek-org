import { getBooks } from '$lib/server/books';
import { translateText } from '$lib/server/translate';
import { getAllBookSettings, applyBookSettings } from '$lib/server/db/book-settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [allBooks, settings, session] = await Promise.all([
		getBooks(),
		getAllBookSettings(),
		locals.auth()
	]);
	const userLocale = cookies.get('locale') as 'ko' | 'en' | undefined;

	// Hidden books are only listed for signed-in members
	const canSeeHidden = !!(session?.user as any)?.isChaekMember;
	const books = allBooks
		.map((book) => applyBookSettings(book, settings))
		.filter((book) => canSeeHidden || !book.isHidden);

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
