-- =============================================================================
-- 20261110_023_blog_rewards.sql
--
-- Community blog rewards (P3). Publishing a post earns EXP through the ledger like every other
-- source: rule `blog.post_published` (20), source_type 'blog_post', source_id = post id.
-- Like milestones (10 / 50 / 100 likes) earn points, not EXP.
--   D1: point rows use action `blog_likes_<n>` because uq_point_transaction_source is
--       UNIQUE (user_id, source_type, source_id, action): one row per post and milestone.
-- =============================================================================

BEGIN;

INSERT INTO profile.exp_rule (rule_key, amount, is_active) VALUES
  ('blog.post_published', 20, true)
ON CONFLICT (rule_key) DO NOTHING;

ALTER TABLE profile.exp_transaction DROP CONSTRAINT exp_transaction_source_type_check;
ALTER TABLE profile.exp_transaction ADD CONSTRAINT exp_transaction_source_type_check
  CHECK (source_type IN ('lesson', 'challenge', 'course', 'achievement', 'adjustment', 'blog_post'));

COMMIT;
