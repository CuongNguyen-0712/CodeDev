-- =============================================================================
-- 20261017_004_commerce_points_entitlements.sql
--
-- Free / Premium courses (design: docs/premium-onboarding-design.md):
--   * commerce.offer         prices (money or points), immutable: a price change deactivates the
--                            old offer and inserts a new one;
--   * commerce.orders/items  reused (empty until now), extended with idempotency and money/points
--                            totals;
--   * commerce.payment       one attempt with a payment provider;
--   * commerce.payment_event webhook inbox, unique per (provider, event id) => duplicate callbacks
--                            are no-ops; only a hash of the payload is kept;
--   * commerce.entitlement   the single source of truth for course access;
--   * profile.point_transaction becomes an append-only ledger (entry types, balance_after,
--                            idempotency key), profile.info.points stays as its cache;
--   * identity.audit_log     append-only log of admin actions;
--   * RBAC permissions for course managers / admins.
--
-- Business functions (one call = one transaction, also over the Neon HTTP driver):
--   post_points, redeem_course_points, create_money_order, apply_payment_event,
--   has_course_access.
-- Errors use SQLSTATE class CD (mapped to HTTP statuses in lib/error/apiError.js):
--   CD400 invalid input, CD402 not enough points, CD403 no access, CD404 not available,
--   CD409 already owned, CD410 no offer, CD422 idempotency key reused for another request.
-- =============================================================================

BEGIN;

-- New enum values are only used by functions (resolved at call time), never in this migration.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'points';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'gateway';

-- ---------------------------------------------------------------- offers
CREATE TABLE IF NOT EXISTS commerce.offer (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id      varchar(50) NOT NULL UNIQUE,
    course_id      bigint      NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    price_type     varchar(10) NOT NULL,
    amount         bigint      NOT NULL,
    currency       char(3),
    is_active      boolean     NOT NULL DEFAULT true,
    created_by     bigint      REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    deactivated_at timestamptz,
    CONSTRAINT chk_offer_price_type CHECK (price_type IN ('money', 'points')),
    CONSTRAINT chk_offer_amount CHECK (amount > 0),
    CONSTRAINT chk_offer_currency CHECK (
        (price_type = 'money' AND currency ~ '^[A-Z]{3}$') OR (price_type = 'points' AND currency IS NULL)
    )
);
COMMENT ON TABLE commerce.offer IS 'Course prices. money: amount in minor units of currency; points: amount in points. Never updated in place except to deactivate';
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_active ON commerce.offer (course_id, price_type) WHERE is_active;

-- Prices from before offers existed (none at the time of writing).
INSERT INTO commerce.offer (public_id, course_id, price_type, amount, currency)
SELECT 'ofr_' || replace(gen_random_uuid()::text, '-', ''), c.id, 'points', c.point_price, NULL
FROM catalog.course c
WHERE COALESCE(c.point_price, 0) > 0
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- orders
ALTER TABLE commerce.orders
    ADD COLUMN IF NOT EXISTS currency        char(3),
    ADD COLUMN IF NOT EXISTS amount_minor    bigint,
    ADD COLUMN IF NOT EXISTS points_total    bigint,
    ADD COLUMN IF NOT EXISTS idempotency_key varchar(100),
    ADD COLUMN IF NOT EXISTS expires_at      timestamptz,
    ADD COLUMN IF NOT EXISTS paid_at         timestamptz,
    ADD COLUMN IF NOT EXISTS failed_at       timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at    timestamptz,
    ADD COLUMN IF NOT EXISTS refunded_at     timestamptz,
    ADD COLUMN IF NOT EXISTS failure_reason  varchar(100);

ALTER TABLE commerce.order_items
    ADD COLUMN IF NOT EXISTS offer_id     bigint REFERENCES commerce.offer(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS amount_minor bigint,
    ADD COLUMN IF NOT EXISTS points       bigint;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_amounts') THEN
        ALTER TABLE commerce.orders ADD CONSTRAINT chk_orders_amounts
            CHECK (COALESCE(amount_minor, 0) >= 0 AND COALESCE(points_total, 0) >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_currency') THEN
        ALTER TABLE commerce.orders ADD CONSTRAINT chk_orders_currency
            CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_amounts') THEN
        ALTER TABLE commerce.order_items ADD CONSTRAINT chk_order_items_amounts
            CHECK (COALESCE(amount_minor, 0) >= 0 AND COALESCE(points, 0) >= 0);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency
    ON commerce.orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pending
    ON commerce.orders (user_id, expires_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS commerce.payment (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id    varchar(50)  NOT NULL UNIQUE,
    order_id     bigint       NOT NULL REFERENCES commerce.orders(id) ON DELETE RESTRICT,
    provider     varchar(30)  NOT NULL,
    provider_ref varchar(255),
    checkout_url text,
    status       varchar(20)  NOT NULL DEFAULT 'pending',
    amount_minor bigint       NOT NULL,
    currency     char(3)      NOT NULL,
    failure_code varchar(100),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    succeeded_at timestamptz,
    refunded_at  timestamptz,
    CONSTRAINT chk_payment_status CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'disputed')),
    CONSTRAINT chk_payment_amount CHECK (amount_minor > 0),
    CONSTRAINT chk_payment_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_payment_provider CHECK (provider ~ '^[a-z0-9_]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_ref
    ON commerce.payment (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_order ON commerce.payment (order_id);

CREATE TABLE IF NOT EXISTS commerce.payment_event (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider       varchar(30)  NOT NULL,
    event_id       varchar(255) NOT NULL,
    event_type     varchar(50)  NOT NULL,
    provider_ref   varchar(255),
    payment_id     bigint REFERENCES commerce.payment(id) ON DELETE SET NULL,
    payload_sha256 char(64)     NOT NULL,
    result         varchar(40),
    received_at    timestamptz  NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    CONSTRAINT uq_payment_event UNIQUE (provider, event_id)
);
COMMENT ON TABLE commerce.payment_event IS 'Verified webhook deliveries; the unique key makes duplicate deliveries no-ops. Raw payloads are not stored';
CREATE INDEX IF NOT EXISTS idx_payment_event_payment ON commerce.payment_event (payment_id);

-- ---------------------------------------------------------------- entitlements
CREATE TABLE IF NOT EXISTS commerce.entitlement (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id     varchar(50) NOT NULL UNIQUE,
    user_id       bigint      NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    course_id     bigint      NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    source        varchar(20) NOT NULL,
    status        varchar(20) NOT NULL DEFAULT 'active',
    order_id      bigint      REFERENCES commerce.orders(id) DEFERRABLE INITIALLY DEFERRED,
    granted_by    bigint      REFERENCES identity.users(id) ON DELETE SET NULL,
    granted_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz,
    revoked_at    timestamptz,
    revoke_reason varchar(50),
    CONSTRAINT chk_entitlement_source CHECK (source IN ('free', 'purchase', 'points', 'admin_grant', 'subscription', 'bundle')),
    CONSTRAINT chk_entitlement_status CHECK (status IN ('active', 'revoked', 'expired')),
    CONSTRAINT chk_entitlement_revoked CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CONSTRAINT chk_entitlement_order CHECK (source NOT IN ('purchase', 'points') OR order_id IS NOT NULL)
);
COMMENT ON TABLE commerce.entitlement IS 'Course access. Checked by public.has_course_access for courses, lessons and challenges';
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlement_active ON commerce.entitlement (user_id, course_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlement_order ON commerce.entitlement (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entitlement_course ON commerce.entitlement (course_id);

-- Everyone enrolled in a free course before entitlements existed keeps access.
INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, granted_at)
SELECT 'ent_' || replace(gen_random_uuid()::text, '-', ''), r.user_id, r.course_id, 'free', COALESCE(r.created_at, now())
FROM learning.register r
JOIN catalog.course c ON c.id = r.course_id
WHERE r.user_id IS NOT NULL AND c.access_model = 'free'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id bigint, _course_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM commerce.entitlement e
        JOIN catalog.course c ON c.id = e.course_id
        WHERE e.user_id = _user_id
          AND e.course_id = _course_id
          AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND c.is_deleted = false
          AND c.publish_status <> 'archived'
    );
$function$;

-- ---------------------------------------------------------------- points ledger
ALTER TABLE profile.point_transaction
    ADD COLUMN IF NOT EXISTS entry_type      varchar(20),
    ADD COLUMN IF NOT EXISTS balance_after   bigint,
    ADD COLUMN IF NOT EXISTS idempotency_key varchar(120),
    -- Deferred: deleting a user (GDPR / test cleanup) removes their orders and, through the user
    -- cascade, their ledger rows in one transaction; the check runs at commit.
    ADD COLUMN IF NOT EXISTS order_id        bigint REFERENCES commerce.orders(id) DEFERRABLE INITIALLY DEFERRED,
    ADD COLUMN IF NOT EXISTS actor_id        bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reason          text;

UPDATE profile.point_transaction
SET entry_type = CASE WHEN action = 'credit' THEN 'earned' ELSE 'spent' END
WHERE entry_type IS NULL;

-- Writers that predate entry_type (previous app version during a deploy) still insert valid rows.
CREATE OR REPLACE FUNCTION profile.point_transaction_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.entry_type IS NULL THEN
        NEW.entry_type := CASE WHEN NEW.action = 'credit' THEN 'earned' ELSE 'spent' END;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_point_transaction_defaults ON profile.point_transaction;
CREATE TRIGGER trg_point_transaction_defaults
    BEFORE INSERT ON profile.point_transaction
    FOR EACH ROW EXECUTE FUNCTION profile.point_transaction_defaults();

ALTER TABLE profile.point_transaction ALTER COLUMN entry_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_point_transaction_action') THEN
        ALTER TABLE profile.point_transaction ADD CONSTRAINT chk_point_transaction_action
            CHECK (action IN ('credit', 'debit'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_point_transaction_entry_type') THEN
        ALTER TABLE profile.point_transaction ADD CONSTRAINT chk_point_transaction_entry_type CHECK (
            (entry_type IN ('earned', 'refunded') AND action = 'credit')
            OR (entry_type IN ('spent', 'expired') AND action = 'debit')
            OR entry_type = 'adjusted'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_point_transaction_balance') THEN
        ALTER TABLE profile.point_transaction ADD CONSTRAINT chk_point_transaction_balance
            CHECK (balance_after IS NULL OR balance_after >= 0);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_transaction_idempotency
    ON profile.point_transaction (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_transaction_user_created
    ON profile.point_transaction (user_id, created_at DESC);

-- Append-only: no UPDATE; DELETE only through the cascade of a deleted user.
CREATE OR REPLACE FUNCTION profile.point_transaction_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM identity.users WHERE id = OLD.user_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Point transactions are append-only';
END;
$function$;

DROP TRIGGER IF EXISTS trg_point_transaction_append_only ON profile.point_transaction;
CREATE TRIGGER trg_point_transaction_append_only
    BEFORE UPDATE OR DELETE ON profile.point_transaction
    FOR EACH ROW EXECUTE FUNCTION profile.point_transaction_append_only();

-- Opening balance: before this migration some points reached profile.info without a ledger row.
-- The balance users see (the cache) is kept; the difference becomes an 'adjusted' entry so that
-- from now on cache = SUM(ledger).
INSERT INTO profile.point_transaction
    (user_id, action, entry_type, amount, source_type, source_id, idempotency_key, balance_after, reason)
SELECT
    d.user_id,
    CASE WHEN d.diff > 0 THEN 'credit' ELSE 'debit' END,
    'adjusted',
    abs(d.diff),
    'reconciliation',
    20261017004,
    'reconcile:20261017_004',
    d.cached,
    'Opening balance: points granted before the ledger was complete'
FROM (
    SELECT i.user_id, COALESCE(i.points, 0) AS cached,
           COALESCE(i.points, 0) - COALESCE((
               SELECT SUM(CASE WHEN pt.action = 'credit' THEN pt.amount ELSE -pt.amount END)
               FROM profile.point_transaction pt WHERE pt.user_id = i.user_id
           ), 0) AS diff
    FROM profile.info i
) d
WHERE d.diff <> 0
ON CONFLICT DO NOTHING;

-- Monitoring: rows here mean the cache drifted from the ledger (should stay empty).
CREATE OR REPLACE VIEW profile.point_balance_drift AS
SELECT i.user_id,
       COALESCE(i.points, 0) AS cached_points,
       COALESCE(l.ledger_points, 0) AS ledger_points
FROM profile.info i
LEFT JOIN (
    SELECT user_id, SUM(CASE WHEN action = 'credit' THEN amount ELSE -amount END) AS ledger_points
    FROM profile.point_transaction
    GROUP BY user_id
) l ON l.user_id = i.user_id
WHERE COALESCE(i.points, 0) <> COALESCE(l.ledger_points, 0);

-- The only writer of points: locks the balance row, appends one ledger entry, updates the cache.
-- Replays (same idempotency key, or same source) return the existing entry with created = false.
CREATE OR REPLACE FUNCTION public.post_points(
    _user_id bigint,
    _action varchar,
    _entry_type varchar,
    _amount bigint,
    _source_type varchar,
    _source_id bigint,
    _idempotency_key varchar DEFAULT NULL,
    _order_id bigint DEFAULT NULL,
    _actor_id bigint DEFAULT NULL,
    _reason text DEFAULT NULL
)
RETURNS TABLE(transaction_id uuid, balance_after bigint, created boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance bigint;
    v_new bigint;
    v_id uuid;
    v_existing record;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Point amount must be positive';
    END IF;
    IF _action NOT IN ('credit', 'debit') THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Unknown point action';
    END IF;

    SELECT COALESCE(i.points, 0) INTO v_balance
    FROM profile.info i
    WHERE i.user_id = _user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User profile not found';
    END IF;

    SELECT pt.id, pt.balance_after INTO v_existing
    FROM profile.point_transaction pt
    WHERE pt.user_id = _user_id
      AND (
            (_idempotency_key IS NOT NULL AND pt.idempotency_key = _idempotency_key)
         OR (pt.source_type = _source_type AND pt.source_id = _source_id AND pt.action = _action)
      )
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.balance_after, false;
        RETURN;
    END IF;

    v_new := v_balance + CASE WHEN _action = 'credit' THEN _amount ELSE -_amount END;
    IF v_new < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD402', MESSAGE = 'Not enough points';
    END IF;

    INSERT INTO profile.point_transaction
        (user_id, action, entry_type, amount, source_type, source_id, idempotency_key, order_id, actor_id, reason, balance_after)
    VALUES
        (_user_id, _action, _entry_type, _amount, _source_type, _source_id, _idempotency_key, _order_id, _actor_id, _reason, v_new)
    RETURNING id INTO v_id;

    UPDATE profile.info SET points = v_new, updated_at = now() WHERE user_id = _user_id;

    RETURN QUERY SELECT v_id, v_new, true;
END;
$function$;

-- ---------------------------------------------------------------- redeem with points
CREATE OR REPLACE FUNCTION public.redeem_course_points(
    _user_public_id varchar,
    _course_public_id varchar,
    _idempotency_key varchar
)
RETURNS TABLE(order_id varchar, course_id varchar, points_spent bigint, balance_after bigint, replayed boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user bigint;
    v_course record;
    v_offer record;
    v_prior record;
    v_order_id bigint;
    v_order_public varchar;
    v_tx record;
BEGIN
    IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Invalid idempotency key';
    END IF;

    SELECT u.id INTO v_user FROM identity.users u WHERE u.public_id = _user_public_id;
    IF v_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User not found';
    END IF;

    -- Serialises every points spend of this user: concurrent / repeated requests run one by one.
    PERFORM 1 FROM profile.info i WHERE i.user_id = v_user FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User profile not found';
    END IF;

    SELECT o.id, o.public_id, o.payment_method::text AS method, o.points_total, c.public_id AS course_public_id
    INTO v_prior
    FROM commerce.orders o
    JOIN commerce.order_items oi ON oi.order_id = o.id
    JOIN catalog.course c ON c.id = oi.course_id
    WHERE o.user_id = v_user AND o.idempotency_key = _idempotency_key
    LIMIT 1;

    IF FOUND THEN
        IF v_prior.method <> 'points' OR v_prior.course_public_id <> _course_public_id THEN
            RAISE EXCEPTION USING ERRCODE = 'CD422', MESSAGE = 'This request key was already used for another order';
        END IF;
        RETURN QUERY
        SELECT v_prior.public_id::varchar, v_prior.course_public_id::varchar, v_prior.points_total,
               (SELECT pt.balance_after FROM profile.point_transaction pt
                WHERE pt.order_id = v_prior.id AND pt.action = 'debit' LIMIT 1),
               true;
        RETURN;
    END IF;

    SELECT c.id, c.public_id, c.publish_status, c.is_deleted, c.access_model INTO v_course
    FROM catalog.course c WHERE c.public_id = _course_public_id;

    IF NOT FOUND OR v_course.is_deleted OR v_course.publish_status <> 'published' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'This course is not available';
    END IF;

    IF EXISTS (
        SELECT 1 FROM commerce.entitlement e
        WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD409', MESSAGE = 'You already own this course';
    END IF;

    SELECT ofr.id, ofr.amount INTO v_offer
    FROM commerce.offer ofr
    WHERE ofr.course_id = v_course.id AND ofr.price_type = 'points' AND ofr.is_active;

    IF NOT FOUND OR v_course.access_model <> 'premium' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD410', MESSAGE = 'This course cannot be redeemed with points';
    END IF;

    -- An active row past its expiry would block the new grant.
    UPDATE commerce.entitlement e SET status = 'expired'
    WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active' AND e.expires_at <= now();

    INSERT INTO commerce.orders (public_id, user_id, status, payment_method, total, points_total, idempotency_key, paid_at, updated_at)
    VALUES ('ord_' || replace(gen_random_uuid()::text, '-', ''), v_user, 'completed', 'points', 0, v_offer.amount, _idempotency_key, now(), now())
    RETURNING id, public_id INTO v_order_id, v_order_public;

    INSERT INTO commerce.order_items (order_id, course_id, price, offer_id, points)
    VALUES (v_order_id, v_course.id, 0, v_offer.id, v_offer.amount);

    SELECT * INTO v_tx
    FROM public.post_points(v_user, 'debit', 'spent', v_offer.amount, 'order', v_order_id,
                            'redeem:' || _idempotency_key, v_order_id, NULL, NULL);

    INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, order_id)
    VALUES ('ent_' || replace(gen_random_uuid()::text, '-', ''), v_user, v_course.id, 'points', v_order_id);

    RETURN QUERY SELECT v_order_public, v_course.public_id::varchar, v_offer.amount, v_tx.balance_after, false;
END;
$function$;

-- ---------------------------------------------------------------- money orders
CREATE OR REPLACE FUNCTION public.create_money_order(
    _user_public_id varchar,
    _course_public_id varchar,
    _idempotency_key varchar,
    _provider varchar,
    _ttl_minutes integer DEFAULT 30
)
RETURNS TABLE(order_id varchar, payment_id varchar, amount_minor bigint, currency char(3), checkout_url text, provider_ref varchar, reused boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user bigint;
    v_course record;
    v_offer record;
    v_prior record;
    v_order_id bigint;
    v_order_public varchar;
    v_payment_public varchar;
BEGIN
    IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Invalid idempotency key';
    END IF;

    SELECT u.id INTO v_user FROM identity.users u WHERE u.public_id = _user_public_id;
    IF v_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User not found';
    END IF;

    PERFORM 1 FROM profile.info i WHERE i.user_id = v_user FOR UPDATE;

    SELECT c.id, c.public_id, c.publish_status, c.is_deleted, c.access_model INTO v_course
    FROM catalog.course c WHERE c.public_id = _course_public_id;

    IF NOT FOUND OR v_course.is_deleted OR v_course.publish_status <> 'published' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'This course is not available';
    END IF;

    -- Replay of the same request, or another click while an order for this course is still open.
    SELECT o.public_id AS order_public, o.payment_method::text AS method,
           oi.course_id, p.public_id AS payment_public, o.amount_minor, o.currency, p.checkout_url, p.provider_ref,
           (o.idempotency_key = _idempotency_key) AS same_key
    INTO v_prior
    FROM commerce.orders o
    JOIN commerce.order_items oi ON oi.order_id = o.id
    LEFT JOIN commerce.payment p ON p.order_id = o.id AND p.provider = _provider
    WHERE o.user_id = v_user
      AND (
            o.idempotency_key = _idempotency_key
         OR (oi.course_id = v_course.id AND o.status = 'pending' AND o.expires_at > now())
      )
    ORDER BY (o.idempotency_key = _idempotency_key) DESC NULLS LAST, o.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_prior.course_id <> v_course.id OR v_prior.method <> 'gateway' THEN
            RAISE EXCEPTION USING ERRCODE = 'CD422', MESSAGE = 'This request key was already used for another order';
        END IF;
        IF v_prior.payment_public IS NOT NULL THEN
            RETURN QUERY SELECT v_prior.order_public::varchar, v_prior.payment_public::varchar, v_prior.amount_minor,
                                v_prior.currency, v_prior.checkout_url, v_prior.provider_ref::varchar, true;
            RETURN;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM commerce.entitlement e
        WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD409', MESSAGE = 'You already own this course';
    END IF;

    SELECT ofr.id, ofr.amount, ofr.currency INTO v_offer
    FROM commerce.offer ofr
    WHERE ofr.course_id = v_course.id AND ofr.price_type = 'money' AND ofr.is_active;

    IF NOT FOUND OR v_course.access_model <> 'premium' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD410', MESSAGE = 'This course cannot be bought';
    END IF;

    UPDATE commerce.orders o
    SET status = 'expired', updated_at = now()
    WHERE o.user_id = v_user AND o.status = 'pending' AND o.expires_at <= now();

    INSERT INTO commerce.orders
        (public_id, user_id, status, payment_method, total, currency, amount_minor, idempotency_key, expires_at, updated_at)
    VALUES (
        'ord_' || replace(gen_random_uuid()::text, '-', ''), v_user, 'pending', 'gateway',
        v_offer.amount::numeric / CASE WHEN v_offer.currency IN ('VND', 'JPY', 'KRW') THEN 1 ELSE 100 END,
        v_offer.currency, v_offer.amount, _idempotency_key,
        now() + make_interval(mins => GREATEST(_ttl_minutes, 5)), now()
    )
    RETURNING id, public_id INTO v_order_id, v_order_public;

    INSERT INTO commerce.order_items (order_id, course_id, price, offer_id, amount_minor)
    VALUES (v_order_id, v_course.id,
            v_offer.amount::numeric / CASE WHEN v_offer.currency IN ('VND', 'JPY', 'KRW') THEN 1 ELSE 100 END,
            v_offer.id, v_offer.amount);

    INSERT INTO commerce.payment (public_id, order_id, provider, amount_minor, currency)
    VALUES ('pay_' || replace(gen_random_uuid()::text, '-', ''), v_order_id, _provider, v_offer.amount, v_offer.currency)
    RETURNING public_id INTO v_payment_public;

    RETURN QUERY SELECT v_order_public, v_payment_public, v_offer.amount, v_offer.currency::char(3), NULL::text, NULL::varchar, false;
END;
$function$;

-- ---------------------------------------------------------------- webhook events
-- Called only after the webhook signature was verified. Idempotent per (provider, event id);
-- grants the entitlement of a paid order exactly once (unique order_id / active per user+course).
CREATE OR REPLACE FUNCTION public.apply_payment_event(
    _provider varchar,
    _event_id varchar,
    _event_type varchar,
    _provider_ref varchar,
    _payment_public_id varchar,
    _amount_minor bigint,
    _currency varchar,
    _payload_sha256 varchar
)
RETURNS TABLE(result varchar, order_id varchar, user_id varchar)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_event_id bigint;
    v_payment record;
    v_order record;
    v_result varchar;
    v_granted bigint;
BEGIN
    INSERT INTO commerce.payment_event (provider, event_id, event_type, provider_ref, payload_sha256)
    VALUES (_provider, _event_id, _event_type, _provider_ref, _payload_sha256)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        RETURN QUERY SELECT 'duplicate'::varchar, NULL::varchar, NULL::varchar;
        RETURN;
    END IF;

    SELECT p.* INTO v_payment
    FROM commerce.payment p
    WHERE p.provider = _provider
      AND ((_provider_ref IS NOT NULL AND p.provider_ref = _provider_ref)
        OR (_payment_public_id IS NOT NULL AND p.public_id = _payment_public_id))
    ORDER BY (p.provider_ref = _provider_ref) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE commerce.payment_event SET result = 'unknown_payment', processed_at = now() WHERE id = v_event_id;
        RETURN QUERY SELECT 'unknown_payment'::varchar, NULL::varchar, NULL::varchar;
        RETURN;
    END IF;

    SELECT o.*, u.public_id AS user_public_id INTO v_order
    FROM commerce.orders o
    JOIN identity.users u ON u.id = o.user_id
    WHERE o.id = v_payment.order_id
    FOR UPDATE OF o;

    IF v_payment.provider_ref IS NULL AND _provider_ref IS NOT NULL THEN
        UPDATE commerce.payment SET provider_ref = _provider_ref, updated_at = now() WHERE id = v_payment.id;
    END IF;

    IF _event_type = 'payment.succeeded' THEN
        IF _amount_minor IS DISTINCT FROM v_payment.amount_minor OR upper(_currency) IS DISTINCT FROM v_payment.currency THEN
            UPDATE commerce.payment SET failure_code = 'amount_mismatch', updated_at = now() WHERE id = v_payment.id;
            v_result := 'amount_mismatch';
        ELSIF v_payment.status IN ('refunded', 'disputed') OR v_order.status = 'refunded' THEN
            v_result := 'ignored_refunded';
        ELSE
            UPDATE commerce.payment
            SET status = 'succeeded', succeeded_at = COALESCE(succeeded_at, now()), failure_code = NULL, updated_at = now()
            WHERE id = v_payment.id;

            UPDATE commerce.orders
            SET status = 'completed', paid_at = COALESCE(paid_at, now()), updated_at = now()
            WHERE id = v_order.id;

            UPDATE commerce.entitlement e SET status = 'expired'
            WHERE e.user_id = v_order.user_id AND e.status = 'active' AND e.expires_at <= now()
              AND e.course_id IN (SELECT oi.course_id FROM commerce.order_items oi WHERE oi.order_id = v_order.id);

            WITH ins AS (
                INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, order_id)
                SELECT 'ent_' || replace(gen_random_uuid()::text, '-', ''), v_order.user_id, oi.course_id, 'purchase', v_order.id
                FROM commerce.order_items oi
                WHERE oi.order_id = v_order.id
                ON CONFLICT DO NOTHING
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_granted FROM ins;

            IF v_granted > 0 THEN
                v_result := 'granted';
            ELSIF EXISTS (SELECT 1 FROM commerce.entitlement e WHERE e.order_id = v_order.id) THEN
                v_result := 'already_applied';
            ELSE
                -- Paid, but the course is already owned through another source: needs a refund.
                v_result := 'already_owned';
                UPDATE commerce.orders SET failure_reason = 'already_owned_refund_required', updated_at = now()
                WHERE id = v_order.id;
            END IF;
        END IF;

    ELSIF _event_type IN ('payment.failed', 'payment.cancelled') THEN
        IF v_payment.status = 'pending' THEN
            UPDATE commerce.payment
            SET status = CASE WHEN _event_type = 'payment.failed' THEN 'failed' ELSE 'cancelled' END, updated_at = now()
            WHERE id = v_payment.id;
            UPDATE commerce.orders
            SET status = CASE WHEN _event_type = 'payment.failed' THEN 'failed'::order_status ELSE 'cancelled'::order_status END,
                failed_at = CASE WHEN _event_type = 'payment.failed' THEN now() END,
                cancelled_at = CASE WHEN _event_type = 'payment.cancelled' THEN now() END,
                updated_at = now()
            WHERE id = v_order.id AND status IN ('pending', 'expired');
            v_result := 'closed';
        ELSE
            v_result := 'ignored_out_of_order';
        END IF;

    ELSIF _event_type IN ('payment.refunded', 'payment.disputed') THEN
        IF v_payment.status IN ('succeeded', 'disputed') THEN
            UPDATE commerce.payment
            SET status = CASE WHEN _event_type = 'payment.refunded' THEN 'refunded' ELSE 'disputed' END,
                refunded_at = CASE WHEN _event_type = 'payment.refunded' THEN now() ELSE refunded_at END,
                updated_at = now()
            WHERE id = v_payment.id;
            IF _event_type = 'payment.refunded' THEN
                UPDATE commerce.orders SET status = 'refunded', refunded_at = now(), updated_at = now() WHERE id = v_order.id;
            END IF;
            UPDATE commerce.entitlement e
            SET status = 'revoked', revoked_at = now(),
                revoke_reason = CASE WHEN _event_type = 'payment.refunded' THEN 'refund' ELSE 'dispute' END
            WHERE e.order_id = v_order.id AND e.status = 'active';
            v_result := 'revoked';
        ELSE
            v_result := 'ignored_out_of_order';
        END IF;

    ELSE
        v_result := 'ignored_type';
    END IF;

    UPDATE commerce.payment_event
    SET result = v_result, payment_id = v_payment.id, processed_at = now()
    WHERE id = v_event_id;

    RETURN QUERY SELECT v_result, v_order.public_id::varchar, v_order.user_public_id::varchar;
END;
$function$;

-- ---------------------------------------------------------------- audit log
CREATE TABLE IF NOT EXISTS identity.audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    bigint       REFERENCES identity.users(id) ON DELETE SET NULL,
    action      varchar(60)  NOT NULL,
    target_type varchar(40)  NOT NULL,
    target_id   varchar(100) NOT NULL,
    reason      text,
    before      jsonb,
    after       jsonb,
    ip_address  varchar(64),
    created_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE identity.audit_log IS 'Append-only log of privileged (admin / course manager) actions';
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON identity.audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON identity.audit_log (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION identity.audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- actor_id is nulled by ON DELETE SET NULL when the admin account is deleted; nothing else may change.
    IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND (NEW.action, NEW.target_type, NEW.target_id, NEW.created_at) = (OLD.action, OLD.target_type, OLD.target_id, OLD.created_at) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Audit log entries are append-only';
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON identity.audit_log;
CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON identity.audit_log
    FOR EACH ROW EXECUTE FUNCTION identity.audit_log_append_only();

-- ---------------------------------------------------------------- RBAC
-- Roles / permissions were seeded with explicit ids: move the id sequences past them first.
SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), GREATEST((SELECT MAX(id) FROM identity.permissions), 1));
SELECT setval(pg_get_serial_sequence('identity.roles', 'id'), GREATEST((SELECT MAX(id) FROM identity.roles), 1));

INSERT INTO identity.permissions (resource, action, description) VALUES
    ('course',      'publish', 'Publish / unpublish / archive courses'),
    ('course',      'price',   'Create and deactivate course offers'),
    ('points',      'adjust',  'Adjust a user''s point balance'),
    ('order',       'list',    'List every order'),
    ('order',       'refund',  'Refund points orders'),
    ('entitlement', 'grant',   'Grant or revoke course access'),
    ('admin',       'read',    'Open the admin area')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO identity.roles (code, name, description)
VALUES ('course_manager', 'Course manager', 'Manages course metadata, publishing and prices')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM identity.roles r
JOIN identity.permissions p ON (
       (r.code = 'admin' AND (p.resource, p.action) IN (
            ('course', 'create'), ('course', 'update'), ('course', 'delete'), ('course', 'publish'), ('course', 'price'),
            ('points', 'adjust'), ('order', 'list'), ('order', 'refund'), ('entitlement', 'grant'), ('admin', 'read')))
    OR (r.code = 'course_manager' AND (p.resource, p.action) IN (
            ('course', 'create'), ('course', 'update'), ('course', 'publish'), ('course', 'price'), ('admin', 'read'),
            ('course', 'read'), ('course', 'list'), ('learning', 'read'), ('learning', 'list'),
            ('home', 'read'), ('home', 'list'), ('index', 'read'), ('settings', 'read'), ('settings', 'update'),
            ('settings', 'list'), ('roadmap', 'read'), ('roadmap', 'list'), ('course', 'learn'), ('course', 'comment')))
)
ON CONFLICT DO NOTHING;

COMMIT;
