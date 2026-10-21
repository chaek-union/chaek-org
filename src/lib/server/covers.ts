import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getBookCoverPaths } from "./books.js";

const execFileAsync = promisify(execFile);

const THUMB_DIR = path.join(process.cwd(), "data", "covers");
// 3x the 80x120 book card, so covers stay sharp on high-DPI screens
const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 360;

/**
 * Make sure every cover declared in a book's book.json has a thumbnail and remove
 * thumbnails of covers that are no longer declared. Run on each book build;
 * ImageMagick only runs for covers whose content changed.
 */
export async function buildCoverThumbnails(bookId: string): Promise<string[]> {
    const thumbs: string[] = [];
    for (const src of await getBookCoverPaths(bookId)) {
        thumbs.push(await getCoverThumbnail(bookId, src));
    }

    const dir = path.join(THUMB_DIR, bookId);
    const keep = new Set(thumbs.map((t) => path.basename(t)));
    const existing = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(
        existing
            .filter((name) => !keep.has(name))
            .map((name) => fs.rm(path.join(dir, name), { force: true })),
    );
    return thumbs;
}

// Concurrent requests for the same cover share one conversion
const pending = new Map<string, Promise<string>>();

/**
 * Return a small WebP cover cropped to the card's 2:3 shape. Thumbnails are
 * keyed by the source image's content, so ImageMagick only runs when the cover
 * itself changes.
 */
export async function getCoverThumbnail(bookId: string, srcPath: string): Promise<string> {
    const key = createHash("sha1")
        .update(`${THUMB_WIDTH}x${THUMB_HEIGHT}:`)
        .update(await fs.readFile(srcPath))
        .digest("hex")
        .slice(0, 16);
    const thumbPath = path.join(THUMB_DIR, bookId, `${key}.webp`);

    try {
        await fs.access(thumbPath);
        return thumbPath;
    } catch {
        // not generated yet
    }

    let job = pending.get(thumbPath);
    if (!job) {
        job = generate(srcPath, thumbPath).finally(() => pending.delete(thumbPath));
        pending.set(thumbPath, job);
    }
    return job;
}

async function generate(srcPath: string, thumbPath: string): Promise<string> {
    await fs.mkdir(path.dirname(thumbPath), { recursive: true });
    const tmpPath = `${thumbPath}.${process.pid}.tmp.webp`;
    const size = `${THUMB_WIDTH}x${THUMB_HEIGHT}`;
    try {
        // Fill the box keeping aspect ratio, then crop the overflow around the center
        await execFileAsync(
            "convert",
            [
                `${srcPath}[0]`,
                "-auto-orient",
                "-thumbnail", `${size}^`,
                "-gravity", "center",
                "-extent", size,
                "-strip",
                "-quality", "82",
                tmpPath,
            ],
            { timeout: 30_000 },
        );
        await fs.rename(tmpPath, thumbPath);
    } catch (error) {
        await fs.rm(tmpPath, { force: true });
        throw error;
    }
    return thumbPath;
}
