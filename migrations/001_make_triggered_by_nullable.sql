-- Migration to merge pdf_builds into build_logs and make triggered_by nullable

-- Add pdf_path and error_message columns to build_logs if they don't exist
ALTER TABLE build_logs
ADD COLUMN IF NOT EXISTS pdf_path TEXT NULL,
ADD COLUMN IF NOT EXISTS error_message TEXT NULL;

-- Make triggered_by nullable in build_logs
ALTER TABLE build_logs
ALTER COLUMN triggered_by DROP NOT NULL;

-- Migrate data from pdf_builds to build_logs if pdf_builds table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pdf_builds') THEN
        -- Insert pdf_builds data into build_logs (only if not already present)
        INSERT INTO build_logs (book_id, book_name, repo_url, status, started_at, completed_at, pdf_path, error_message, triggered_by)
        SELECT book_id, book_name, repo_url, status, started_at, completed_at, pdf_path, error_message, triggered_by
        FROM pdf_builds
        WHERE NOT EXISTS (
            SELECT 1 FROM build_logs bl
            WHERE bl.book_id = pdf_builds.book_id
            AND bl.started_at = pdf_builds.started_at
        );

        -- Drop pdf_builds table
        DROP TABLE pdf_builds;
    END IF;
END $$;
