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
 * Escape backslashes for LaTeX/PDF generation
 * Converts single backslashes to double backslashes within inline code
 * to prevent LaTeX from interpreting them as control sequences
 */
function escapeBackslashesForPdf(content: string): string {
    // Escape backslashes within inline code (`...`)
    // Match inline code and replace backslashes with double backslashes
    return content.replace(/`([^`]+)`/g, (match, code) => {
        const escaped = code.replace(/\\/g, "\\\\");
        return `\`${escaped}\``;
    });
}

/**
 * Process GitBook-style {% include "./path" %} directives.
 * Resolves file content relative to the book root.
 */
async function processIncludes(
    content: string,
    bookRoot: string,
): Promise<string> {
    const includePattern = /\{%\s*include\s+["']([^"']+)["']\s*%\}/g;
    const matches = [...content.matchAll(includePattern)];
    if (matches.length === 0) return content;

    let result = content;
    for (const match of matches) {
        const [fullMatch, includePath] = match;
        try {
            const filePath = path.join(bookRoot, includePath);
            const fileContent = await fs.readFile(filePath, "utf-8");
            result = result.replace(fullMatch, fileContent.trimEnd());
        } catch {
            // If include file not found, leave as-is
        }
    }
    return result;
}

/**
 * Process markdown content with variable replacement
 */
export async function processMarkdown(
    bookId: string,
    markdown: string,
    options?: { skipAnchors?: boolean; forPdf?: boolean; bookRoot?: string },
): Promise<string> {
    // Get book variables
    const variables = await getBookVariables(bookId);

    // Replace variables
    let processed = replaceVariables(markdown, variables);

    // Process includes if bookRoot is provided
    if (options?.bookRoot) {
        processed = await processIncludes(processed, options.bookRoot);
    }

    // Process anchors only if not skipped (skip for PDF generation)
    if (!options?.skipAnchors) {
        processed = processAnchors(processed);
    } else {
        // For PDF generation, just remove the {#anchor} syntax
        processed = processed.replace(/\s*\{#[a-zA-Z0-9_-]+\}\s*$/gm, "");
    }

    // Escape backslashes for PDF generation
    if (options?.forPdf) {
        processed = escapeBackslashesForPdf(processed);
    }

    return processed;
}
