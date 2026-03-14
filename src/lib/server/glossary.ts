import fs from 'fs/promises';
import path from 'path';
import { getBookRoot, parseSummary, getFilePaths } from './summary-parser';

const GLOSSARY_DIR = path.join(process.cwd(), 'chaek-org-translation-glossary', 'glossary');

interface GlossaryEntry {
	en: string;
	ko: string;
}

// Category → keywords that indicate the book covers this subject
const CATEGORY_KEYWORDS: Record<string, string[]> = {
	'biosciences/bioinformatics': [
		'bioinformatics', 'genomic', 'genome', 'sequencing', 'alignment', 'blast',
		'fasta', 'fastq', 'bam', 'sam', 'vcf', 'snp', 'variant', 'annotation',
		'omics', 'proteomics', 'transcriptomics', 'metagenomics',
		'생명정보', '지놈', '유전체', '시퀀싱', '바이오인포매틱스'
	],
	'biosciences/molecular-biology': [
		'molecular biology', 'dna', 'rna', 'protein', 'gene expression',
		'transcription', 'translation', 'replication', 'cell', 'enzyme',
		'분자생물', '단백질', '유전자 발현', '전사', '세포'
	],
	'biosciences/neuroscience': [
		'neuroscience', 'neuron', 'brain', 'synapse', 'neural', 'cortex',
		'신경과학', '뉴런', '뇌', '시냅스'
	],
	'chemistry/general-chemistry': [
		'chemistry', 'chemical', 'reaction', 'molecule', 'atom', 'element',
		'화학', '반응', '분자', '원자', '원소'
	],
	'chemistry/organic-chemistry': [
		'organic chemistry', 'hydrocarbon', 'functional group', 'synthesis',
		'유기화학', '탄화수소', '작용기'
	],
	'computer-science/general-terms': [
		'computer science', 'algorithm', 'data structure', 'programming',
		'software', 'compiler', 'operating system', 'python', 'coding',
		'컴퓨터', '알고리즘', '자료구조', '프로그래밍', '소프트웨어', '코딩'
	],
	'computer-science/machine-learning': [
		'machine learning', 'deep learning', 'neural network', 'training',
		'classification', 'regression', 'model', 'ai ', 'artificial intelligence',
		'기계학습', '딥러닝', '신경망', '인공지능'
	],
	'mathematics/general-mathematics': [
		'mathematics', 'calculus', 'algebra', 'theorem', 'proof', 'equation',
		'수학', '미적분', '대수', '정리', '증명', '방정식'
	],
	'mathematics/statistics': [
		'statistics', 'probability', 'distribution', 'hypothesis', 'regression',
		'p-value', 'confidence interval', 'variance', 'mean', 'median',
		'통계', '확률', '분포', '가설', '회귀', '분산', '평균'
	],
	'physics/general-physics': [
		'physics', 'force', 'energy', 'momentum', 'wave', 'thermodynamics',
		'물리', '힘', '에너지', '운동량', '파동', '열역학'
	],
	'physics/quantum-mechanics': [
		'quantum', 'wave function', 'hamiltonian', 'schrödinger', 'superposition',
		'양자', '파동함수', '해밀토니안', '슈뢰딩거'
	]
};

// Always include these categories regardless of content
const ALWAYS_INCLUDE = ['general/academic-expressions', 'general/research-methodology', 'metadata/author-names', 'metadata/publishing-terms'];

const bookCategoryCache = new Map<string, string[]>();

/**
 * Parse a glossary TSV file and return entries.
 * Lines starting with # are comments. Format: en\tko
 */
async function parseTsv(filePath: string): Promise<GlossaryEntry[]> {
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		const entries: GlossaryEntry[] = [];
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			// Strip inline comments
			const withoutComment = trimmed.replace(/\t[^#]*#.*$/, (m) => m.replace(/#.*$/, '').trim()) || trimmed;
			const parts = trimmed.split('\t');
			if (parts.length >= 2) {
				const en = parts[0].trim();
				const ko = parts[1].replace(/#.*$/, '').trim();
				if (en && ko) entries.push({ en, ko });
			}
		}
		return entries;
	} catch {
		return [];
	}
}

/**
 * Detect which glossary categories are relevant for a book
 * by sampling its content and matching keywords.
 */
export async function detectBookCategories(bookId: string): Promise<string[]> {
	const cached = bookCategoryCache.get(bookId);
	if (cached) return cached;

	// Try reading from disk cache
	const cachePath = path.join(process.cwd(), 'data', 'book-translations', bookId, '.glossary-categories');
	try {
		const stored = (await fs.readFile(cachePath, 'utf-8')).trim();
		if (stored) {
			const categories = stored.split('\n').filter(Boolean);
			bookCategoryCache.set(bookId, categories);
			return categories;
		}
	} catch { /* no cache */ }

	// Sample book content for keyword matching
	let sampleText = '';
	try {
		const bookRoot = await getBookRoot(bookId);

		// Include book title
		try {
			const bookJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'books', bookId, 'book.json'), 'utf-8'));
			if (bookJson.title) sampleText += bookJson.title + ' ';
		} catch { /* no book.json */ }

		// Include book ID (often descriptive)
		sampleText += bookId.replace(/[-_]/g, ' ') + ' ';

		// Sample first few pages
		const navigation = await parseSummary(bookId);
		const filePaths = getFilePaths(navigation);
		const samplesToRead = filePaths.slice(0, 5);
		for (const filePath of samplesToRead) {
			try {
				const content = await fs.readFile(path.join(bookRoot, filePath), 'utf-8');
				// Take first 2000 chars of each file
				sampleText += content.slice(0, 2000) + ' ';
			} catch { /* skip */ }
		}
	} catch { /* book not found */ }

	const lowerSample = sampleText.toLowerCase();
	const matched: string[] = [];

	for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
		for (const keyword of keywords) {
			if (lowerSample.includes(keyword.toLowerCase())) {
				matched.push(category);
				break;
			}
		}
	}

	const categories = [...new Set([...ALWAYS_INCLUDE, ...matched])];
	bookCategoryCache.set(bookId, categories);

	// Persist to disk
	try {
		const dir = path.dirname(cachePath);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(cachePath, categories.join('\n'), 'utf-8');
	} catch { /* non-critical */ }

	return categories;
}

/**
 * Load glossary entries for a book based on its detected categories.
 * Returns entries only if the glossary files have content.
 */
export async function loadBookGlossary(bookId: string): Promise<GlossaryEntry[]> {
	const categories = await detectBookCategories(bookId);
	const allEntries: GlossaryEntry[] = [];
	const seen = new Set<string>();

	for (const category of categories) {
		const filePath = path.join(GLOSSARY_DIR, `${category}.tsv`);
		const entries = await parseTsv(filePath);
		for (const entry of entries) {
			const key = `${entry.en.toLowerCase()}|${entry.ko}`;
			if (!seen.has(key)) {
				seen.add(key);
				allEntries.push(entry);
			}
		}
	}

	return allEntries;
}

/**
 * Build a glossary instruction string for the translation prompt.
 * Returns empty string if no glossary entries.
 */
export function buildGlossaryPrompt(entries: GlossaryEntry[], sourceLang: string, targetLang: string): string {
	if (entries.length === 0) return '';

	const header = sourceLang === 'en' ? 'English' : 'Korean';
	const targetHeader = targetLang === 'en' ? 'English' : 'Korean';

	const lines = entries.map(e => {
		const source = sourceLang === 'en' ? e.en : e.ko;
		const target = targetLang === 'en' ? e.en : e.ko;
		return `  ${source} → ${target}`;
	});

	return [
		'',
		'Use the following glossary for specific terms (source → target):',
		...lines
	].join('\n');
}

/**
 * Invalidate cached glossary categories for a book.
 */
export function invalidateGlossaryCache(bookId: string): void {
	bookCategoryCache.delete(bookId);
	const cachePath = path.join(process.cwd(), 'data', 'book-translations', bookId, '.glossary-categories');
	fs.rm(cachePath).catch(() => {});
}
