import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSummary, getBookRoot, type NavItem } from '$lib/server/summary-parser';
import { callLLM, type LLMMessage } from '$lib/server/llm';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { bookId, messages } = await request.json();

		// Parse navigation to get all sections
		const navigation = await parseSummary(bookId);
		const bookRoot = await getBookRoot(bookId);

		// Build context about book structure
		const bookStructure = buildBookStructure(navigation);

		// Get the last user message
		const lastMessage = messages[messages.length - 1].content;

		// Search for relevant sections
		const relevantSections = await findRelevantSections(bookRoot, navigation, lastMessage);

		// Build system prompt with full section content
		const systemPrompt = `You are an AI assistant helping users understand a textbook.

Book structure:
${bookStructure}

FULL CONTENT of relevant sections for the current question:
${relevantSections.map(s => `
=== ${s.title} ===
Path: ${s.path}

${s.content}
`).join('\n---\n')}

Instructions:
1. Use the conversation history below to maintain context across messages
2. Reference the full section content provided above to answer accurately
3. Suggest related sections for further reading using format: [Section Title](path/to/file.md)
4. Be concise but thorough
5. If the question relates to previous messages, maintain continuity in your responses`;

		// Call LLM with full conversation history
		const llmMessages: LLMMessage[] = [
			{ role: 'system', content: systemPrompt },
			...messages.map((m: any) => ({
				role: m.role as 'user' | 'assistant',
				content: m.content
			}))
		];

		const assistantMessage = await callLLM(llmMessages);

		return json({ message: assistantMessage });
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to process chat message' }, { status: 500 });
	}
};

function buildBookStructure(navigation: NavItem[], level = 0): string {
	let structure = '';
	for (const item of navigation) {
		const indent = '  '.repeat(level);
		if (item.isHeader) {
			structure += `${indent}## ${item.title}\n`;
			if (item.children && item.children.length > 0) {
				structure += buildBookStructure(item.children, level);
			}
		} else if (item.path) {
			structure += `${indent}- ${item.title} (${item.path})\n`;
			if (item.children && item.children.length > 0) {
				structure += buildBookStructure(item.children, level + 1);
			}
		}
	}
	return structure;
}

async function findRelevantSections(bookRoot: string, navigation: NavItem[], query: string) {
	try {
		// Step 1: Build chapter list (top-level items)
		const chapters = navigation.map((item, i) => ({
			index: i,
			title: item.title,
			item: item
		}));

		const chapterList = chapters.map((c, i) => `${i}. ${c.title}`).join('\n');

		// Step 2: Find most relevant chapters using LLM
		const chapterPrompt = `Given this user question: "${query}"

And these available chapters from the textbook:
${chapterList}

Select the 2-3 most relevant chapter numbers (just the numbers, comma-separated) that would help answer this question. Respond with ONLY the numbers, no explanation.`;

		const chapterResponse = await callLLM(
			[{ role: 'user', content: chapterPrompt }],
			{ maxTokens: 50 }
		);

		const selectedChapterIndices = chapterResponse
			.trim()
			.split(',')
			.map((n: string) => parseInt(n.trim()))
			.filter((n: number) => !isNaN(n) && n >= 0 && n < chapters.length)
			.slice(0, 3);

		if (selectedChapterIndices.length === 0) {
			selectedChapterIndices.push(0); // Fallback to first chapter
		}

		// Step 3: Collect sections from selected chapters
		const sectionsInChapters: Array<{ title: string; path: string; chapterTitle: string }> = [];

		for (const chapterIdx of selectedChapterIndices) {
			const chapter = chapters[chapterIdx];
			const collectSections = (items: NavItem[], chapterTitle: string) => {
				for (const item of items) {
					if (item.path && !item.isHeader) {
						sectionsInChapters.push({
							title: item.title,
							path: item.path,
							chapterTitle: chapterTitle
						});
					}
					if (item.children) {
						collectSections(item.children, chapterTitle);
					}
				}
			};

			if (chapter.item.children) {
				collectSections(chapter.item.children, chapter.title);
			} else if (chapter.item.path) {
				sectionsInChapters.push({
					title: chapter.item.title,
					path: chapter.item.path,
					chapterTitle: chapter.title
				});
			}
		}

		// Step 4: Find most relevant sections within selected chapters
		const sectionList = sectionsInChapters
			.map((s, i) => `${i}. ${s.chapterTitle} > ${s.title}`)
			.join('\n');

		const sectionPrompt = `Given this user question: "${query}"

And these available sections from the relevant chapters:
${sectionList}

Select the 2-3 most relevant section numbers (just the numbers, comma-separated) that would help answer this question. Respond with ONLY the numbers, no explanation.`;

		const sectionResponse = await callLLM(
			[{ role: 'user', content: sectionPrompt }],
			{ maxTokens: 50 }
		);

		const selectedSectionIndices = sectionResponse
			.trim()
			.split(',')
			.map((n: string) => parseInt(n.trim()))
			.filter((n: number) => !isNaN(n) && n >= 0 && n < sectionsInChapters.length)
			.slice(0, 3);

		// Step 5: Read full content of selected sections
		const relevantSections = [];
		for (const idx of selectedSectionIndices) {
			const section = sectionsInChapters[idx];
			try {
				const filePath = join(bookRoot, section.path);
				const content = await readFile(filePath, 'utf-8');
				relevantSections.push({
					title: `${section.chapterTitle} > ${section.title}`,
					path: section.path,
					content: content // Full content, not truncated
				});
			} catch (error) {
				console.error(`Failed to read section ${section.path}:`, error);
			}
		}

		return relevantSections;
	} catch (error) {
		console.error('Error in LLM section selection:', error);
		// Fallback: return first section
		const fallback = navigation[0];
		if (fallback?.path) {
			try {
				const content = await readFile(join(bookRoot, fallback.path), 'utf-8');
				return [{
					title: fallback.title,
					path: fallback.path,
					content: content
				}];
			} catch {
				return [];
			}
		}
		return [];
	}
}
