-- =============================================================================
-- 20261024_005_achievements.sql
--
-- Achievements (docs/master-plan-v1.3-adaptation.md P3), graded automatically from data the
-- platform already records. Each one is earned once per user; its EXP goes through the ledger
-- like every other source (rule `achievement.<code>` in profile.exp_rule, source_type
-- 'achievement', source_id = achievement id), so it never replaces EXP from learning.
--   bug_hunter    fix-the-bug challenges passed                         (code_submissions)
--   self_reliant  coding challenges passed without hint 3 open first    (EXP ledger, metadata.assisted)
-- public.award_achievements(user) is called right after a challenge reward, in the same transaction.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS profile.achievement (
  id          smallint PRIMARY KEY,
  code        varchar(40) NOT NULL UNIQUE,
  title       varchar(80) NOT NULL,
  description text NOT NULL,
  threshold   integer NOT NULL CONSTRAINT achievement_threshold_check CHECK (threshold > 0),
  sort_order  smallint NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS profile.user_achievement (
  user_id        bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  achievement_id smallint NOT NULL REFERENCES profile.achievement(id),
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

INSERT INTO profile.achievement (id, code, title, description, threshold, sort_order) VALUES
  (1, 'bug_hunter', 'Bug Hunter', 'Pass 5 fix-the-bug challenges.', 5, 1),
  (2, 'self_reliant', 'Self-Reliant', 'Pass 10 coding challenges without opening hint 3 first.', 10, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile.exp_rule (rule_key, amount, is_active) VALUES
  ('achievement.bug_hunter', 30, true),
  ('achievement.self_reliant', 50, true)
ON CONFLICT (rule_key) DO NOTHING;

ALTER TABLE profile.exp_transaction DROP CONSTRAINT exp_transaction_source_type_check;
ALTER TABLE profile.exp_transaction ADD CONSTRAINT exp_transaction_source_type_check
  CHECK (source_type IN ('lesson', 'challenge', 'course', 'achievement', 'adjustment'));

-- Progress of a user towards every active achievement (counts compared with threshold).
CREATE OR REPLACE FUNCTION public.achievement_progress(_user_id bigint)
 RETURNS TABLE(achievement_id smallint, progress integer)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT a.id,
           CASE a.code
               WHEN 'bug_hunter' THEN (
                   SELECT COUNT(DISTINCT s.challenge_id)
                   FROM challenge.code_submissions s
                   JOIN challenge.challenges ch ON ch.id = s.challenge_id
                   WHERE s.user_id = _user_id AND s.status = 'passed' AND ch.type = 'fix_bug')
               WHEN 'self_reliant' THEN (
                   -- One EXP transaction per passed challenge; `assisted` marks hint 3 opened before it.
                   SELECT COUNT(*)
                   FROM profile.exp_transaction t
                   JOIN challenge.challenges ch ON ch.id = t.source_id
                   WHERE t.user_id = _user_id AND t.source_type = 'challenge'
                     AND ch.type IN ('fix_bug', 'mini_coding')
                     AND COALESCE((t.metadata->>'assisted')::boolean, false) = false)
               ELSE 0
           END::int
    FROM profile.achievement a
    WHERE a.is_active;
$function$;

-- Grants every achievement the user now qualifies for and its EXP; returns only the new ones.
CREATE OR REPLACE FUNCTION public.award_achievements(_user_id bigint)
 RETURNS TABLE(code character varying, title character varying, awarded integer, exp_after bigint, previous_level integer, new_level integer)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    a record;
    e record;
BEGIN
    FOR a IN
        SELECT ac.id, ac.code, ac.title
        FROM public.achievement_progress(_user_id) p
        JOIN profile.achievement ac ON ac.id = p.achievement_id
        WHERE p.progress >= ac.threshold
          AND NOT EXISTS (SELECT 1 FROM profile.user_achievement ua WHERE ua.user_id = _user_id AND ua.achievement_id = ac.id)
        ORDER BY ac.sort_order, ac.id
    LOOP
        INSERT INTO profile.user_achievement (user_id, achievement_id) VALUES (_user_id, a.id) ON CONFLICT DO NOTHING;
        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        SELECT * INTO e FROM public.award_exp(_user_id, 'achievement.' || a.code, 'achievement', a.id);
        code := a.code;
        title := a.title;
        awarded := COALESCE(e.awarded, 0);
        exp_after := e.exp_after;
        previous_level := e.previous_level;
        new_level := e.new_level;
        RETURN NEXT;
    END LOOP;
END;
$function$;

COMMIT;
