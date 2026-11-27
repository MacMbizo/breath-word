# C4: AuthN/AuthZ & Shared Pool Tenancy

**Document ID:** `C4`  
**Version:** `1.0.1`  
**Status:** `Approved`  
**Owner:** Founder / Security  
**Last Updated:** `2026-11-27`  
**Related Docs:** `B2`, `B4`, `B6`, `C2`, `C3`

## Purpose & Scope

Defines authentication flows (including zero-loss Offline Guest → Authenticated upgrade), Role-Based Access Control (RBAC) for Shared Church Pools, exact PostgreSQL Row-Level Security (RLS) SQL policies, and the secure `join_shared_pool_by_code` RPC.

## Audience

Developer and AI coding partner authoring `supabase/migrations/0003_rls_and_rpcs.sql` and `packages/core/src/auth/`.

## Body

### 4.1 Authentication Modes & Guest-to-Account Migration

1. **Offline Guest Mode (Default on First Launch):**
   - Generates a local UUID `guestUserId` stored in `local_device.sqlite` (`workspace_state`). All local writes use `user_id = guestUserId`. PowerSync stays disconnected.
2. **Supported Supabase Auth Providers:**
   - Email + Password, Email Magic Link (lowest friction for church members on Web Companion), Google Sign-In, and Sign in with Apple (required by App Store if offering Google on iPadOS).
3. **Zero-Loss Guest → Account Upgrade Protocol:**
   - When a Guest signs into a Supabase account (`authUserId`):
     1. Run an atomic local SQLite transaction rewriting `user_id = guestUserId` → `authUserId` (and `owner_user_id` / `created_by_user_id`) across all local rows.
     2. Connect PowerSync (`powersync.connect(connector)`), which uploads all migrated local records seamlessly into the user's Supabase account.
     3. Offer the optional 30-second Private Vault E2EE wizard (`B6 §4.2`).

### 4.2 Shared Pool RBAC Matrix

| Action | `OWNER` | `LEADER` | `MEMBER` (Leader-Curated) | `MEMBER` (Collaborative: `allow_member_contributions = true`) |
| --- | :---: | :---: | :---: | :---: |
| View pool & items | Yes | Yes | Yes | Yes |
| Edit pool title/visibility/share_code | Yes | No | No | No |
| Soft-delete pool / remove members | Yes | No | No | No |
| Add / edit / delete pool items | Yes | Yes | No | Own items only |
| Read/write own `prayer_item_user_states` (notes, counts, testimony) | Yes (private) | Yes (private) | Yes (private) | Yes (private) |
| Read another member's `prayer_item_user_states` | **Never** | **Never** | **Never** | **Never** |

### 4.3 Authoritative PostgreSQL RLS & Anti-Recursion Helpers (`supabase/migrations/0003_rls_and_rpcs.sql`)

```sql
-- ============================================================================
-- SECURITY DEFINER HELPERS (Prevents RLS infinite recursion across pool tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_pool_member(p_pool_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.prayer_pool_members
        WHERE pool_id = p_pool_id AND user_id = auth.uid() AND deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.is_pool_leader_or_owner(p_pool_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.prayer_pool_members
        WHERE pool_id = p_pool_id AND user_id = auth.uid()
          AND role IN ('OWNER', 'LEADER') AND deleted_at IS NULL
    );
$$;

-- Enable RLS on ALL 11 synced tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ink_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_pool_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_item_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_plan_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

-- 1. Strictly Personal Tables (user_id = auth.uid())
CREATE POLICY "own_profile" ON public.user_profiles
    FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own_highlights" ON public.highlights
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_study_notes" ON public.study_notes
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_ink_canvases" ON public.ink_canvases
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_item_states" ON public.prayer_item_user_states
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_session_logs" ON public.prayer_session_logs
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_enrollments" ON public.reading_plan_enrollments
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_reading_progress" ON public.reading_progress
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Prayer Pools (Read if member or owner; Write only if owner)
CREATE POLICY "pools_select_member" ON public.prayer_pools
    FOR SELECT USING (owner_user_id = auth.uid() OR public.is_pool_member(id));

CREATE POLICY "pools_insert_owner" ON public.prayer_pools
    FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "pools_update_owner" ON public.prayer_pools
    FOR UPDATE USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- 3. Prayer Pool Members (Members see roster; self can leave; owner manages roles)
CREATE POLICY "members_select_pool" ON public.prayer_pool_members
    FOR SELECT USING (user_id = auth.uid() OR public.is_pool_member(pool_id));

CREATE POLICY "members_update_self_or_owner" ON public.prayer_pool_members
    FOR UPDATE USING (
        user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.prayer_pools p WHERE p.id = pool_id AND p.owner_user_id = auth.uid()
        )
    );

-- 4. Prayer Pool Items (Read if member; Insert/Update if leader/owner OR collaborative pool)
CREATE POLICY "items_select_member" ON public.prayer_pool_items
    FOR SELECT USING (public.is_pool_member(pool_id));

CREATE POLICY "items_insert_authorized" ON public.prayer_pool_items
    FOR INSERT WITH CHECK (
        created_by_user_id = auth.uid() AND (
            public.is_pool_leader_or_owner(pool_id) OR EXISTS (
                SELECT 1 FROM public.prayer_pools p
                WHERE p.id = pool_id AND p.allow_member_contributions = true AND public.is_pool_member(pool_id)
            )
        )
    );

CREATE POLICY "items_update_authorized" ON public.prayer_pool_items
    FOR UPDATE USING (
        public.is_pool_leader_or_owner(pool_id) OR (
            created_by_user_id = auth.uid() AND public.is_pool_member(pool_id)
        )
    );
```

### 4.4 Secure `join_shared_pool_by_code` RPC (Anti-Enumeration)

```sql
CREATE TABLE public.share_code_attempts (
    user_id uuid NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_user_time ON public.share_code_attempts(user_id, attempted_at DESC);

-- A failed attempt MUST be committed. Because a plain INSERT shares the caller's
-- transaction, a RAISE would roll it back (PostgREST rolls back on error), leaving the
-- rate limit permanently inert. PostgreSQL has no autonomous transactions, and a
-- loopback `dblink` is unusable here (non-superusers must supply a password, which
-- would leak a credential into the schema), so the branch that records the attempt
-- RETURNS its error code instead of raising. The branches with no durable side effect
-- (AUTH_REQUIRED, POOL_JOIN_RATE_LIMITED) keep raising. Shipped in
-- `supabase/migrations/0004_fix_join_rate_limit_attempt_log.sql`.

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

-- Owner-only RPC to rotate a compromised share_code
CREATE OR REPLACE FUNCTION public.rotate_pool_share_code(p_pool_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford Base32
    v_code text := '';
    v_i integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.prayer_pools
        WHERE id = p_pool_id AND owner_user_id = auth.uid() AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'POOL_PERMISSION_DENIED';
    END IF;

    FOR v_i IN 1..8 LOOP
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
    END LOOP;

    UPDATE public.prayer_pools
       SET share_code = v_code,
           visibility = 'SHARED',
           updated_at = now()
     WHERE id = p_pool_id;

    RETURN v_code;
END;
$$;
```

## Acceptance / Done Criteria

- Supabase RLS test suite verifies:
  - User B cannot `SELECT` or `UPDATE` User A's `prayer_item_user_states`, `study_notes`, or `prayer_session_logs`.
  - A `MEMBER` in a leader-curated pool (`allow_member_contributions = false`) receives HTTP 403 when attempting to `INSERT` into `prayer_pool_items`.
  - Five consecutive invalid calls to `join_shared_pool_by_code` each yield `POOL_SHARE_CODE_INVALID` (returned as `{"error":"POOL_SHARE_CODE_INVALID"}`) and are durably recorded; the sixth call within 15 minutes raises `POOL_JOIN_RATE_LIMITED`.
- Guest-to-Account upgrade migrates all local rows (`highlights`, `study_notes`, `prayer_pools`, `prayer_pool_items`, `prayer_item_user_states`) with zero data loss and syncs cleanly to Supabase.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` For iPadOS App Store / TestFlight distribution, Sign in with Apple will be enabled alongside Email Magic Link if Google OAuth is exposed.

## Change Log

- `1.0.1` | `2026-11-27` | Athena | Fix inert join rate limit: `join_shared_pool_by_code` now returns `{"error":"POOL_SHARE_CODE_INVALID"}` on a bad code (so the failed-attempt log commits) while `AUTH_REQUIRED` / `POOL_JOIN_RATE_LIMITED` keep raising. Shipped in `supabase/migrations/0004_fix_join_rate_limit_attempt_log.sql`.
- `1.0.0` | `2026-11-24` | Athena | Complete AuthN/Guest upgrade protocol, Shared Pool RBAC matrix, non-recursive Postgres RLS SQL, and rate-limited `join_shared_pool_by_code` / `rotate_pool_share_code` RPCs.

## Traceability

- Upstream: `A2` (`FR-202`, `FR-206`), `B2`, `B4`, `B6`. Downstream: `C2`, `C3`, `F1`.
