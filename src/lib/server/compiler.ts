import { simpleGit } from "simple-git";
import fs from "fs/promises";
import path from "path";
import child_process from "child_process";
import lunr from "lunr";
import { createBuildLog, updateBuildLog } from "./db/builds.js";
import {
    parseSummary,
    getBookRoot,
    getFilePaths,
    getFilePathsWithChapters,
} from "./summary-parser.js";
import { buildEvents } from "./build-events.js";

const BOOKS_DIR = path.join(process.cwd(), "books");
const STATIC_BOOKS_DIR = path.join(process.cwd(), "static", "books");

interface CompilationResult {
    success: boolean;
    message: string;
    error?: string;
    buildId?: number;
    stdout?: string;
    stderr?: string;
}

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
 * Clone or update a repository
 */
async function syncRepository(
    repoName: string,
    repoUrl: string,
): Promise<void> {
    const repoPath = path.join(BOOKS_DIR, repoName);

    try {
        await fs.access(repoPath);
        // Directory exists, check if it's a git repository
        const gitDir = path.join(repoPath, ".git");
        try {
            await fs.access(gitDir);
            // It's a git repository, pull latest changes
            console.log(`Pulling latest changes for ${repoName}...`);
            const git = simpleGit(repoPath);
            await git.pull();
        } catch {
            // Directory exists but is not a git repository, remove and clone
            console.log(
                `Removing invalid directory and cloning ${repoName}...`,
            );
            await fs.rm(repoPath, { recursive: true, force: true });
            await fs.mkdir(BOOKS_DIR, { recursive: true });
            const git = simpleGit();
            await git.clone(repoUrl, repoPath);
        }
    } catch {
        // Repository doesn't exist, clone it
        console.log(`Cloning ${repoName}...`);
        await fs.mkdir(BOOKS_DIR, { recursive: true });
        const git = simpleGit();
        await git.clone(repoUrl, repoPath);
    }
}

/**
 * Build Lunr search index for a book
 */
async function buildSearchIndex(
    repoName: string,
    buildId: number,
): Promise<CompilationResult> {
    try {
        await buildEvents.emitLog(
            buildId,
            "stdout",
            `Building search index for ${repoName}...`,
        );

        // Get navigation and file paths with chapters
        const navigation = await parseSummary(repoName);
        const filePathsWithChapters = getFilePathsWithChapters(navigation);
        const bookRoot = await getBookRoot(repoName);

        await buildEvents.emitLog(
            buildId,
            "stdout",
            `Found ${filePathsWithChapters.length} files to index`,
        );

        // Build documents for search
        const documents = await Promise.all(
            filePathsWithChapters.map(async ({ path: filePath, chapter }) => {
                try {
                    const fullPath = path.join(bookRoot, filePath);
                    const content = await fs.readFile(fullPath, "utf-8");

                    // Remove markdown syntax for better search
                    const cleanContent = content
                        .replace(/^#+\s+/gm, "") // Remove headers
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
                        .replace(/[*_`]/g, "") // Remove emphasis markers
                        .replace(/!\[[^\]]*\]\([^)]+\)/g, ""); // Remove images

                    // Extract title from first heading or filename
                    const titleMatch = content.match(/^#\s+(.+)$/m);
                    const title =
                        titleMatch?.[1] ||
                        filePath.split("/").pop()?.replace(".md", "") ||
                        filePath;

                    return {
                        id: filePath,
                        path: filePath,
                        title,
                        chapter,
                        content: cleanContent,
                    };
                } catch (err) {
                    console.error(`Error reading ${filePath}:`, err);
                    return null;
                }
            }),
        );

        // Filter out failed reads
        const validDocuments = documents.filter((doc) => doc !== null);

        await buildEvents.emitLog(
            buildId,
            "stdout",
            `Successfully indexed ${validDocuments.length} documents`,
        );

        // Build Lunr index
        const idx = lunr(function () {
            this.ref("id");
            this.field("title", { boost: 10 });
            this.field("content");

            validDocuments.forEach((doc) => {
                this.add(doc);
            });
        });

        // Save index to static/books/{bookId} directory
        const staticBookDir = path.join(STATIC_BOOKS_DIR, repoName);
        await fs.mkdir(staticBookDir, { recursive: true });
        const indexPath = path.join(staticBookDir, "search-index.json");
        await fs.writeFile(
            indexPath,
            JSON.stringify({
                index: idx,
                documents: validDocuments.map((doc) => ({
                    id: doc.id,
                    path: doc.path,
                    title: doc.title,
                    chapter: doc.chapter,
                })),
            }),
        );

        return {
            success: true,
            message: `Successfully built search index for ${repoName}`,
            stdout: `Successfully built search index with ${validDocuments.length} documents`,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error(
            `Error building search index for ${repoName}:`,
            errorMessage,
        );

        return {
            success: false,
            message: `Failed to build search index for ${repoName}`,
            error: errorMessage,
        };
    }
}

/**
 * Build PDF from markdown using pandoc
 */
async function buildPdf(
    repoName: string,
    buildId: number,
): Promise<{ success: boolean; pdfPath?: string; error?: string }> {
    try {
        await buildEvents.emitLog(
            buildId,
            "stdout",
            `Building PDF for ${repoName}...`,
        );

        // Get file paths and book root
        const navigation = await parseSummary(repoName);
        const filePaths = getFilePaths(navigation);
        const bookRoot = await getBookRoot(repoName);

        await buildEvents.emitLog(
            buildId,
            "stdout",
            `Found ${filePaths.length} files to compile`,
        );

        // Create temporary directory for PDF build
        const tmpDir = path.join("/tmp", `pdf-build-${repoName}-${Date.now()}`);
        await fs.mkdir(tmpDir, { recursive: true });

        // Copy assets directory if it exists
        const assetsDir = path.join(bookRoot, "assets");
        const tmpAssetsDir = path.join(tmpDir, "assets");
        try {
            await fs.access(assetsDir);
            await fs.cp(assetsDir, tmpAssetsDir, { recursive: true });
            console.log(`Copied assets directory for ${repoName}`);
        } catch {
            // No assets directory, create one for downloaded images
            await fs.mkdir(tmpAssetsDir, { recursive: true });
        }

        // Track downloaded images
        const downloadedImages = new Map<string, string>();
        let imageCounter = 0;

        // Concatenate all markdown files in order
        const combinedMd = path.join(tmpDir, "book.md");
        const chunks: string[] = [];

        for (const filePath of filePaths) {
            try {
                const fullPath = path.join(bookRoot, filePath);
                let content = await fs.readFile(fullPath, "utf-8");

                // Download remote images and replace URLs
                const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
                let match;
                while ((match = imageRegex.exec(content)) !== null) {
                    const url = match[2];

                    // Check if already downloaded
                    if (!downloadedImages.has(url)) {
                        try {
                            // Get file extension from URL, checking query params for format hints
                            const urlObj = new URL(url);
                            const pathname = urlObj.pathname;
                            let ext = path.extname(pathname);

                            // Check query parameters for format hints (e.g., ?as=webp)
                            const asParam = urlObj.searchParams.get("as");
                            if (
                                asParam &&
                                asParam.match(/^(webp|png|jpg|jpeg|gif|svg)$/i)
                            ) {
                                ext = `.${asParam.toLowerCase()}`;
                            } else if (!ext) {
                                ext = ".png";
                            }

                            const localFilename = `remote-image-${imageCounter}${ext}`;
                            const localPath = path.join(
                                tmpAssetsDir,
                                localFilename,
                            );

                            // Download the image using curl with user-agent to bypass bot protection
                            await buildEvents.emitLog(
                                buildId,
                                "stdout",
                                `Downloading image: ${url}`,
                            );
                            await new Promise<void>((resolve, reject) => {
                                const curl = child_process.spawn("curl", [
                                    "-L",
                                    "-A",
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                    "-o",
                                    localPath,
                                    url,
                                ]);
                                curl.on("close", (code: number | null) => {
                                    if (code === 0) {
                                        resolve();
                                    } else {
                                        reject(
                                            new Error(
                                                `curl exited with code ${code}`,
                                            ),
                                        );
                                    }
                                });
                                curl.on("error", reject);
                            });

                            // Verify the downloaded file is actually an image, not HTML
                            const fileBuffer = await fs.readFile(localPath);
                            const fileStart = fileBuffer
                                .toString(
                                    "utf-8",
                                    0,
                                    Math.min(200, fileBuffer.length),
                                )
                                .trim();

                            if (
                                fileStart.startsWith("<!DOCTYPE") ||
                                fileStart.startsWith("<html")
                            ) {
                                // Downloaded HTML instead of image (likely Cloudflare challenge)
                                await fs.unlink(localPath);
                                throw new Error(
                                    "Downloaded HTML instead of image (bot protection detected)",
                                );
                            }

                            // For SVG files, verify they start with valid SVG content
                            if (ext === ".svg") {
                                if (
                                    !fileStart.startsWith("<?xml") &&
                                    !fileStart.startsWith("<svg")
                                ) {
                                    // Invalid SVG file
                                    await fs.unlink(localPath);
                                    throw new Error(
                                        "Downloaded invalid SVG file",
                                    );
                                }
                            }

                            // Convert WebP to PNG since XeLaTeX doesn't support WebP
                            let finalFilename = localFilename;
                            if (ext === ".webp") {
                                const pngFilename = `remote-image-${imageCounter}.png`;
                                const pngPath = path.join(
                                    tmpAssetsDir,
                                    pngFilename,
                                );
                                await buildEvents.emitLog(
                                    buildId,
                                    "stdout",
                                    `Converting WebP to PNG: ${localFilename}`,
                                );
                                await new Promise<void>((resolve, reject) => {
                                    const convert = child_process.spawn(
                                        "convert",
                                        [localPath, pngPath],
                                    );
                                    convert.on(
                                        "close",
                                        (code: number | null) => {
                                            if (code === 0) {
                                                resolve();
                                            } else {
                                                reject(
                                                    new Error(
                                                        `convert exited with code ${code}`,
                                                    ),
                                                );
                                            }
                                        },
                                    );
                                    convert.on("error", reject);
                                });
                                // Remove original WebP file
                                await fs.unlink(localPath);
                                finalFilename = pngFilename;
                            }

                            downloadedImages.set(
                                url,
                                `assets/${finalFilename}`,
                            );
                            imageCounter++;
                        } catch (err) {
                            console.error(
                                `Failed to download image ${url}:`,
                                err,
                            );
                            await buildEvents.emitLog(
                                buildId,
                                "stderr",
                                `Failed to download image: ${url}`,
                            );
                        }
                    }
                }

                // Replace remote URLs with local paths or alt text
                content = content.replace(
                    /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g,
                    (_match: string, alt: string, url: string) => {
                        const localPath = downloadedImages.get(url);
                        if (localPath) {
                            return `![${alt}](${localPath})`;
                        }
                        // Image download failed, replace with alt text in italics
                        return alt
                            ? `*[Image: ${alt}]*`
                            : `*[Image not available]*`;
                    },
                );

                // Fix relative image paths to work from tmpDir
                // Handle various relative path patterns: ../assets, ../../assets, ./assets, assets
                content = content.replace(
                    /!\[([^\]]*)\]\((?:\.\.\/)+assets\//g,
                    "![$1](assets/",
                );
                content = content.replace(
                    /!\[([^\]]*)\]\(\.\/assets\//g,
                    "![$1](assets/",
                );
                // Also handle paths that don't start with ./ or ../
                content = content.replace(
                    /!\[([^\]]*)\]\((?!http|\/|assets\/)(.*?)\)/g,
                    (match: string, alt: string, imgPath: string) => {
                        // If path contains assets, extract from assets onwards
                        if (imgPath.includes("assets/")) {
                            const assetsIndex = imgPath.indexOf("assets/");
                            return `![${alt}](${imgPath.substring(assetsIndex)})`;
                        }
                        return match;
                    },
                );

                chunks.push(content);
                chunks.push("\n\n");
            } catch (err) {
                console.error(`Error reading ${filePath}:`, err);
            }
        }

        await fs.writeFile(combinedMd, chunks.join(""));

        // Get book title from book.json or use repo name
        let bookTitle = repoName;
        try {
            const bookJsonPath = path.join(BOOKS_DIR, repoName, "book.json");
            const bookConfig = JSON.parse(
                await fs.readFile(bookJsonPath, "utf-8"),
            );
            bookTitle = bookConfig.title || repoName;
        } catch {
            // Use repo name if book.json doesn't exist
        }

        // Build PDF using pandoc + xelatex
        // Assets are copied to tmpDir, so pandoc can find relative paths
        const outputPdf = path.join(tmpDir, `${repoName}.pdf`);

        // Use spawn to stream output line by line
        await new Promise<void>((resolve, reject) => {
            const pandoc = child_process.spawn(
                "pandoc",
                [
                    combinedMd,
                    "-o",
                    outputPdf,
                    "--pdf-engine=xelatex",
                    "--resource-path=.:assets",
                    "-V",
                    "mainfont:KoPubWorldDotum Medium",
                    "-V",
                    "mainfontoptions:BoldFont=KoPubWorldDotum Bold,ItalicFont=KoPubWorldDotum Light",
                    "-V",
                    "geometry:margin=1in",
                    "-V",
                    `title:${bookTitle}`,
                    "--toc",
                    "--toc-depth=3",
                    "--from",
                    "markdown-fancy_lists",
                    "-N",
                ],
                {
                    cwd: tmpDir,
                },
            );

            // Stream stdout line by line
            let stdoutBuffer = "";
            let logQueue = Promise.resolve();

            pandoc.stdout.on("data", (data: any) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split("\n");
                stdoutBuffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.trim()) {
                        logQueue = logQueue.then(() =>
                            buildEvents.emitLog(buildId, "stdout", line),
                        );
                    }
                }
            });

            // Stream stderr line by line
            let stderrBuffer = "";
            pandoc.stderr.on("data", (data: any) => {
                stderrBuffer += data.toString();
                const lines = stderrBuffer.split("\n");
                stderrBuffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.trim()) {
                        logQueue = logQueue.then(() =>
                            buildEvents.emitLog(buildId, "stderr", line),
                        );
                    }
                }
            });

            pandoc.on("close", async (code: number | null) => {
                // Emit remaining buffered lines
                if (stdoutBuffer.trim()) {
                    logQueue = logQueue.then(() =>
                        buildEvents.emitLog(buildId, "stdout", stdoutBuffer),
                    );
                }
                if (stderrBuffer.trim()) {
                    logQueue = logQueue.then(() =>
                        buildEvents.emitLog(buildId, "stderr", stderrBuffer),
                    );
                }

                // Wait for all logs to be written
                await logQueue;

                // Check if PDF was generated despite errors
                try {
                    await fs.access(outputPdf);
                    // PDF exists, consider build successful even with warnings
                    await buildEvents.emitLog(
                        buildId,
                        "stdout",
                        "PDF generated successfully despite warnings",
                    );
                    resolve();
                } catch {
                    // PDF doesn't exist, this is a real failure
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`pandoc exited with code ${code}`));
                    }
                }
            });

            pandoc.on("error", (error: Error) => {
                reject(error);
            });
        });

        // Copy PDF to static/books/{bookId} directory
        const staticBookDir = path.join(STATIC_BOOKS_DIR, repoName);
        await fs.mkdir(staticBookDir, { recursive: true });
        const finalPdfPath = path.join(staticBookDir, `${repoName}.pdf`);
        await fs.copyFile(outputPdf, finalPdfPath);

        // Clean up temp directory
        await fs.rm(tmpDir, { recursive: true, force: true });

        const relativePath = `/books/${repoName}/${repoName}.pdf`;
        console.log(`Successfully built PDF: ${relativePath}`);

        return {
            success: true,
            pdfPath: relativePath,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error(`Error building PDF for ${repoName}:`, errorMessage);
        return {
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Process a book: clone/update, build search index, and build PDF
 */
export async function processBook(
    repoName: string,
    repoUrl: string,
    triggeredBy?: string,
): Promise<CompilationResult> {
    let buildId: number | undefined;

    try {
        // Ensure directories exist
        await fs.mkdir(BOOKS_DIR, { recursive: true });
        await fs.mkdir(STATIC_BOOKS_DIR, { recursive: true });

        // Sync repository first
        await syncRepository(repoName, repoUrl);

        // Read book title from book.json
        const bookTitle = await getBookTitle(repoName);

        // Create build log entry with correct title
        const buildLog = await createBuildLog(
            repoName,
            bookTitle,
            repoUrl,
            triggeredBy,
        );
        buildId = buildLog.id;

        // Emit start status
        await buildEvents.emitStatus(buildId, "running");

        // Build search index first
        const indexResult = await buildSearchIndex(repoName, buildId);

        // Then build PDF
        const pdfResult = await buildPdf(repoName, buildId);

        // Determine overall build status
        const allSuccess = indexResult.success && pdfResult.success;
        const status = allSuccess ? "success" : "failed";

        // Emit result messages
        if (pdfResult.success) {
            await buildEvents.emitLog(
                buildId,
                "stdout",
                `PDF built successfully: ${pdfResult.pdfPath}`,
            );
        } else if (pdfResult.error) {
            await buildEvents.emitLog(
                buildId,
                "stderr",
                `PDF build failed: ${pdfResult.error}`,
            );
        }

        // Update build log with final status
        await updateBuildLog(buildId, status);

        // Emit final status
        await buildEvents.emitStatus(buildId, status);

        console.log(
            `Build completed for ${repoName}: index=${indexResult.success}, pdf=${pdfResult.success}`,
        );

        return {
            success: allSuccess,
            message: allSuccess
                ? `Build completed for ${repoName}`
                : `Build completed with errors for ${repoName}`,
            buildId,
        };
    } catch (error) {
        console.error(`Error processing book ${repoName}:`, error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        // Update build log with error if we have a buildId
        if (buildId) {
            await buildEvents.emitLog(buildId, "stderr", errorMessage);
            await updateBuildLog(buildId, "failed");
        }

        return {
            success: false,
            message: `Error processing ${repoName}`,
            error: errorMessage,
            buildId,
        };
    }
}

/**
 * Extract repository name from GitHub URL
 */
export function extractRepoName(repoUrl: string): string {
    const match = repoUrl.match(/github\.com\/[^\/]+\/([^\/\.]+)/);
    return match ? match[1] : "";
}
