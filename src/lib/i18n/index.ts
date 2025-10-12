import { derived, writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type Locale = 'ko' | 'en';

interface Translations {
	[key: string]: any;
}

// Import translations statically
import koTranslations from './locales/ko.json';
import enTranslations from './locales/en.json';

const translations: Record<Locale, Translations> = {
	ko: koTranslations,
	en: enTranslations
};

// Get browser language or default to Korean
function getBrowserLocale(): Locale {
	if (!browser) return 'ko';

	const browserLang = navigator.language.toLowerCase();
	if (browserLang.startsWith('ko')) return 'ko';
	if (browserLang.startsWith('en')) return 'en';

	return 'ko'; // Default to Korean
}

// Get stored locale or browser locale
function getInitialLocale(): Locale {
	if (!browser) return 'ko'; // SSR default

	const stored = localStorage.getItem('locale');
	if (stored === 'ko' || stored === 'en') {
		return stored;
	}

	return getBrowserLocale();
}

// Create locale store with SSR-safe initialization
export const locale = writable<Locale>('ko');

// Initialize locale after mount
if (browser) {
	locale.set(getInitialLocale());

	// Save locale to localStorage when it changes
	locale.subscribe((value) => {
		localStorage.setItem('locale', value);
	});
}

// Translation function - always returns translations
export const t = derived(locale, ($locale) => {
	return (key: string, vars?: Record<string, string>): string => {
		const keys = key.split('.');
		let value: any = translations[$locale];

		for (const k of keys) {
			if (value && typeof value === 'object') {
				value = value[k];
			} else {
				return key; // Return key if translation not found
			}
		}

		let result = typeof value === 'string' ? value : key;

		// Replace variables like {varName} with actual values
		if (vars) {
			Object.entries(vars).forEach(([varName, varValue]) => {
				result = result.replace(new RegExp(`\\{${varName}\\}`, 'g'), varValue);
			});
		}

		return result;
	};
});

// Switch locale function
export function setLocale(newLocale: Locale) {
	locale.set(newLocale);
}

// Get current locale
export function getLocale(): Locale {
	return get(locale);
}
