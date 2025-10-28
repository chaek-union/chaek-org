import fs from "fs/promises";
import path from "path";

export interface Book {
    id: string;
    name: string;
    description?: string;
    lastUpdated?: Date;
    hasPdf?: boolean;
}

export const BOOKS_DIR = path.join(process.cwd(), "books");
export const STATIC_BOOKS_DIR = path.join(process.cwd(), "static", "books");

interface BookJson {
    title?: string;
    root?: string;
}

/**
 * Get book title from book.json, fallback to formatted bookId
 */
async function getBookTitle(bookId: string): Promise<string> {
    const bookJsonPath = path.join(BOOKS_DIR, bookId, "book.json");
    try {
        const content = await fs.readFile(bookJsonPath, "utf-8");
        const bookJson: BookJson = JSON.parse(content);
        if (bookJson.title) {
            return bookJson.title;
        }
    } catch {
        // If book.json doesn't exist or can't be parsed, fall through to default
    }
    // Default: convert kebab-case to space-separated
    return bookId.replace(/-/g, " ");
}

/**
 * Get list of all available books
 */
export async function getBooks(): Promise<Book[]> {
    try {
        await fs.mkdir(BOOKS_DIR, { recursive: true });
        const entries = await fs.readdir(BOOKS_DIR, { withFileTypes: true });

        const books: Book[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const bookPath = path.join(BOOKS_DIR, entry.name);
                const stats = await fs.stat(bookPath);

                // Check if SUMMARY.md exists (valid book)
                const summaryPath = path.join(bookPath, "SUMMARY.md");
                let bookJsonPath = path.join(bookPath, "book.json");

                // Try to find SUMMARY.md in book root or docs subdirectory
                let hasValidStructure = false;
                try {
                    await fs.access(summaryPath);
                    hasValidStructure = true;
                } catch {
                    // Check if book.json defines a root directory
                    try {
                        const bookJson = JSON.parse(
                            await fs.readFile(bookJsonPath, "utf-8"),
                        );
                        const root = bookJson.root || ".";
                        const altSummaryPath = path.join(
                            bookPath,
                            root,
                            "SUMMARY.md",
                        );
                        await fs.access(altSummaryPath);
                        hasValidStructure = true;
                    } catch {
                        // Book not valid
                    }
                }

                if (hasValidStructure) {
                    // Check if PDF exists
                    const pdfPath = path.join(
                        STATIC_BOOKS_DIR,
                        entry.name,
                        `${entry.name}.pdf`,
                    );
                    let hasPdf = false;
                    try {
                        await fs.access(pdfPath);
                        hasPdf = true;
                    } catch {
                        // PDF doesn't exist
                    }

                    const bookTitle = await getBookTitle(entry.name);
                    books.push({
                        id: entry.name,
                        name: bookTitle,
                        lastUpdated: stats.mtime,
                        hasPdf,
                    });
                }
            }
        }

        return books.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } catch (error) {
        console.error("Error reading books directory:", error);
        return [];
    }
}

/**
 * Check if a book exists
 */
export async function bookExists(bookId: string): Promise<boolean> {
    try {
        const bookPath = path.join(BOOKS_DIR, bookId);
        await fs.access(bookPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get book metadata
 */
export async function getBookMetadata(bookId: string): Promise<Book | null> {
    try {
        const bookPath = path.join(BOOKS_DIR, bookId);
        const stats = await fs.stat(bookPath);

        const bookTitle = await getBookTitle(bookId);
        return {
            id: bookId,
            name: bookTitle,
            lastUpdated: stats.mtime,
        };
    } catch {
        return null;
    }
}
