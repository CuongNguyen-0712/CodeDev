-- =============================================================================
-- 20261104_019_coding_snippets.sql
--
-- Snippet mode for coding challenges (content/README.md "Rules for challenges"): a list of short
-- pre-written code pieces the learner clicks to insert into the editor and marks as used.
--   coding_configs.snippets   [{ "id", "label", "code", "note"?, "distractor"? }], NULL = no pieces.
--                             Piece-assembly challenges store pieces.json (build-pieces.mjs) here;
--                             the service shuffles it per learner and drops "distractor".
--                             Written by content/tools/build-seed.mjs from challenges.json
--                             coding.snippets (shape checked by content/tools/verify-course.mjs).
-- =============================================================================

BEGIN;

ALTER TABLE challenge.coding_configs ADD COLUMN IF NOT EXISTS snippets jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_coding_configs_snippets') THEN
        ALTER TABLE challenge.coding_configs
            ADD CONSTRAINT chk_coding_configs_snippets CHECK (snippets IS NULL OR jsonb_typeof(snippets) = 'array');
    END IF;
END $$;

COMMIT;
