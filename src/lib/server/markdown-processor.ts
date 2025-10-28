import fs from 'fs/promises';
import path from 'path';
import { BOOKS_DIR } from './books';

interface BookJson {
    title?: string;
    root?: string;
    variables?: Record<string, string>;
}

/**
 * Load book.json and return variables
 */
export async function getBookVariables(bookId: string): Promise<Record<string, string>> {
    const bookJsonPath = path.join(BOOKS_DIR, bookId, 'book.json');
    try {
        const content = await fs.readFile(bookJsonPath, 'utf-8');
        const bookJson: BookJson = JSON.parse(content);
        return bookJson.variables || {};
    } catch {
        return {};
    }
}

/**
 * Replace {{ book.variable }} with actual values from book.json
 */
export function replaceVariables(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{\s*book\.(\w+)\s*\}\}/g, (match, variableName) => {
        return variables[variableName] || match;
    });
}

/**
 * Replace {#anchor} with proper HTML anchor attribute
 * Converts: ## Heading {#custom-id}
 * To: ## Heading {#custom-id}
 * (mdsvex will handle the {#id} syntax automatically)
 */
export function processAnchors(content: string): string {
    // mdsvex already supports {#id} syntax for custom IDs
    // No transformation needed - it's built into mdsvex
    return content;
}

/**
 * Process markdown content with variable replacement
 */
export async function processMarkdown(bookId: string, markdown: string): Promise<string> {
    // Get book variables
    const variables = await getBookVariables(bookId);

    // Replace variables
    let processed = replaceVariables(markdown, variables);

    // Process anchors (no-op for now as mdsvex handles {#id} syntax)
    processed = processAnchors(processed);

    return processed;
}
