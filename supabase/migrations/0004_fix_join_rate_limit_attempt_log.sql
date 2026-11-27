-- ============================================================================
-- 0004_fix_join_rate_limit_attempt_log.sql
-- Authority: C4 §4.4 (anti-enumeration RPC), B6 §4.1 (Spoofing control), plan P2-15.
--
-- BUG FIX. `join_shared_pool_by_code` (0003) recorded a failed attempt with a plain
-- INSERT immediately followed by RAISE EXCEPTION. Both statements execute inside the
-- caller's transaction, and PostgREST rolls that transaction back whenever the
-- function raises (pgTAP's `throws_ok` behaves the same via a savepoint), so the
-- attempt was never committed. `share_code_attempts` therefore stayed empty, the
-- 5-failures/15-minutes window never filled, and POOL_JOIN_RATE_LIMITED could never
-- fire — leaving the High-severity brute-force control inert.
--
-- PostgreSQL has no autonomous transactions, so an attempt cannot be both durably
-- recorded and raised on in the same call. `dblink` is not an option here: the
-- loopback connection would need the database password in the connection string
-- (dblink refuses passwordless connections from non-superusers, and `postgres` is
-- not a superuser on Supabase), which would leak a credential into the schema.
--
-- Instead the branch that has a durable side effect RETURNS its error code:
-- `{"error":"POOL_SHARE_CODE_INVALID"}` commits the attempt. The two branches that
-- have nothing to persist — AUTH_REQUIRED and POOL_JOIN_RATE_LIMITED — keep raising.
-- The client maps either shape to the canonical AppError (C3).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_shared_pool_by_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_recent_fails integer;
    v_pool record;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT count(*) INTO v_recent_fails
      FROM public.share_code_attempts
     WHERE user_id = v_uid AND attempted_at > now() - interval '15 minutes';

    IF v_recent_fails >= 5 THEN
        RAISE EXCEPTION 'POOL_JOIN_RATE_LIMITED';
    END IF;

    SELECT id, title INTO v_pool
      FROM public.prayer_pools
     WHERE share_code = upper(trim(p_code))
       AND visibility = 'SHARED'
       AND deleted_at IS NULL;

    IF v_pool.id IS NULL THEN
        -- Must COMMIT: this branch RETURNS instead of raising, because a RAISE here
        -- would roll the INSERT back and the rate-limit window could never fill.
        INSERT INTO public.share_code_attempts (user_id) VALUES (v_uid);
        RETURN jsonb_build_object('error', 'POOL_SHARE_CODE_INVALID');
    END IF;

    INSERT INTO public.prayer_pool_members (id, pool_id, user_id, role, joined_at, updated_at, deleted_at)
    VALUES (gen_random_uuid(), v_pool.id, v_uid, 'MEMBER', now(), now(), NULL)
    ON CONFLICT (pool_id, user_id) DO UPDATE
        SET deleted_at = NULL,
            updated_at = now();

    RETURN jsonb_build_object(
        'poolId', v_pool.id,
        'title', v_pool.title,
        'role', 'MEMBER'
    );
END;
$$;
