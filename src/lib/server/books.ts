import fs from "fs/promises";
import path from "path";

export interface Book {
    id: string;
    name: string;
    description?: string;
    lastUpdated?: Date;
    hasPdf?: boolean;
    hasCover?: boolean;
}

export const BOOKS_DIR = path.join(process.cwd(), "books");
export const STATIC_BOOKS_DIR = path.join(process.cwd(), "static", "books");

const BOOK_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * Check that a book ID is a plain directory name (no separators, no "..")
 */
export function isValidBookId(bookId: unknown): bookId is string {
    return typeof bookId === "string" && BOOK_ID_PATTERN.test(bookId);
}

/**
 * Check whether target resolves to base itself or a path inside it
 */
export function isWithin(base: string, target: string): boolean {
    const rel = path.relative(path.resolve(base), path.resolve(target));
    return (
        rel === "" ||
        (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel))
    );
}

/**
 * Join relPath onto base, returning null if the result escapes base
 */
export function safeJoin(base: string, relPath: string): string | null {
    const joined = path.join(base, relPath);
    return isWithin(base, joined) ? joined : null;
}

interface BookJson {
    title?: string;
    root?: string;
    // Path to the cover image, relative to the repository root (where
    // book.json lives). Either a single path or one per locale.
    cover?: string | Record<string, string>;
}

const COVER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/**
 * Resolve the cover image declared in book.json to an absolute path.
 * Per-locale covers fall back to the other locales when the requested one is missing.
 */
export async function getBookCover(bookId: string, locale?: string): Promise<string | null> {
    if (!isValidBookId(bookId)) return null;
    const bookPath = path.join(BOOKS_DIR, bookId);
    let cover: BookJson["cover"];
    try {
        const bookJson: BookJson = JSON.parse(
            await fs.readFile(path.join(bookPath, "book.json"), "utf-8"),
        );
        cover = bookJson.cover;
    } catch {
        return null;
    }

    let candidates: string[] = [];
    if (typeof cover === "string") {
        candidates = [cover];
    } else if (cover && typeof cover === "object") {
        const entries = Object.entries(cover).filter(
            (e): e is [string, string] => typeof e[1] === "string",
        );
        candidates = [
            ...entries.filter(([lang]) => lang === locale),
            ...entries.filter(([lang]) => lang !== locale),
        ].map(([, p]) => p);
    }

    for (const rel of candidates) {
        const filePath = safeJoin(bookPath, rel);
        if (!filePath || !COVER_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
        try {
            if ((await fs.stat(filePath)).isFile()) return filePath;
        } catch {
            // try next candidate
        }
    }
    return null;
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
                        hasCover: (await getBookCover(entry.name)) !== null,
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
    if (!isValidBookId(bookId)) return false;
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
    if (!isValidBookId(bookId)) return null;
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
