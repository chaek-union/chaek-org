import fs from "fs/promises";
import path from "path";
import { BOOKS_DIR } from "./books";

interface BookJson {
    title?: string;
    root?: string;
    variables?: Record<string, string>;
}

/**
 * Load book.json and return variables
 */
export async function getBookVariables(
    bookId: string,
): Promise<Record<string, string>> {
    const bookJsonPath = path.join(BOOKS_DIR, bookId, "book.json");
    try {
        const content = await fs.readFile(bookJsonPath, "utf-8");
        const bookJson: BookJson = JSON.parse(content);
        return bookJson.variables || {};
    } catch {
        return {};
    }
}

/**
 * Replace {{ book.variable }} with actual values from book.json
 */
export function replaceVariables(
    content: string,
    variables: Record<string, string>,
): string {
    return content.replace(
        /\{\{\s*book\.(\w+)\s*\}\}/g,
        (match, variableName) => {
            return variables[variableName] || match;
        },
    );
}

/**
 * Replace {#anchor} with HTML heading attributes and anchor links
 * Converts: ## Heading {#custom-id}
 * To: <h2 id="custom-id"><a href="#custom-id" class="anchor-link">Heading</a></h2>
 *
 * This ensures custom anchors work correctly instead of relying on auto-generated slugs
 */
export function processAnchors(content: string): string {
    // Match headings with {#anchor} syntax
    // Pattern: (# heading text) {#anchor-id}
    return content.replace(
        /^(#{1,6})\s+(.+?)\s+\{#([a-zA-Z0-9_-]+)\}\s*$/gm,
        (match, hashes, headingText, anchorId) => {
            const level = hashes.length;
            const cleanText = headingText.trim();
            // Convert to HTML with custom id and anchor link
            return `<h${level} id="${anchorId}"><a href="#${anchorId}" class="anchor-link">${cleanText}</a></h${level}>`;
        },
    );
}

/**
 * Process markdown content with variable replacement
 */
export async function processMarkdown(
    bookId: string,
    markdown: string,
    options?: { skipAnchors?: boolean },
): Promise<string> {
    // Get book variables
    const variables = await getBookVariables(bookId);

    // Replace variables
    let processed = replaceVariables(markdown, variables);

    // Process anchors only if not skipped (skip for PDF generation)
    if (!options?.skipAnchors) {
        processed = processAnchors(processed);
    } else {
        // For PDF generation, just remove the {#anchor} syntax
        processed = processed.replace(/\s*\{#[a-zA-Z0-9_-]+\}\s*$/gm, "");
    }

    return processed;
}
