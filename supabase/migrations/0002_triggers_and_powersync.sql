-- ============================================================================
-- 0002_triggers_and_powersync.sql — Replication publication & server-side guards
-- Authority: B2 §4.2 ("PostgreSQL Replication & Server-Side Triggers"),
--            C2 §4.2 (conflict resolution policy).
--
-- PowerSync requires (a) a logical-replication publication over the synced tables
-- and (b) authoritative server timestamps so client clock skew cannot corrupt
-- Last-Write-Wins. A cascading soft-delete trigger keeps children from orphaning
-- when a pool is tombstoned, and the `pray_count` guard keeps the per-user prayer
-- counter monotonic across concurrent offline devices.
-- ============================================================================

-- 1. PowerSync Logical Replication Publication (all 11 synced tables from B4 §4.3)
CREATE PUBLICATION powersync FOR TABLE
    public.user_profiles,
    public.highlights,
    public.study_notes,
    public.ink_canvases,
    public.prayer_pools,
    public.prayer_pool_members,
    public.prayer_pool_items,
    public.prayer_item_user_states,
    public.prayer_session_logs,
    public.reading_plan_enrollments,
    public.reading_progress;

-- 2. Authoritative Server Timestamp Trigger (mitigates client device clock skew)
CREATE OR REPLACE FUNCTION public.set_server_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := GREATEST(COALESCE(NEW.updated_at, now()), now());
    RETURN NEW;
END;
$$;

-- Apply identically to all 11 synced tables.
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_highlights_updated_at
BEFORE UPDATE ON public.highlights
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_study_notes_updated_at
BEFORE UPDATE ON public.study_notes
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_ink_canvases_updated_at
BEFORE UPDATE ON public.ink_canvases
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_prayer_pools_updated_at
BEFORE UPDATE ON public.prayer_pools
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_prayer_pool_members_updated_at
BEFORE UPDATE ON public.prayer_pool_members
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_prayer_pool_items_updated_at
BEFORE UPDATE ON public.prayer_pool_items
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_prayer_item_user_states_updated_at
BEFORE UPDATE ON public.prayer_item_user_states
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_prayer_session_logs_updated_at
BEFORE UPDATE ON public.prayer_session_logs
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_reading_plan_enrollments_updated_at
BEFORE UPDATE ON public.reading_plan_enrollments
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

CREATE TRIGGER trg_reading_progress_updated_at
BEFORE UPDATE ON public.reading_progress
FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

-- 2b. Monotonic prayer counter (C2 §4.2). Two offline devices praying the same card
--     converge to the greater count instead of the last writer winning.
CREATE OR REPLACE FUNCTION public.enforce_pray_count_monotonic()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.pray_count := GREATEST(OLD.pray_count, NEW.pray_count);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prayer_item_user_states_pray_count
BEFORE UPDATE ON public.prayer_item_user_states
FOR EACH ROW EXECUTE FUNCTION public.enforce_pray_count_monotonic();

-- 3. Soft-Delete Cascade Trigger: When a prayer_pool is tombstoned, tombstone its items & memberships
CREATE OR REPLACE FUNCTION public.cascade_pool_soft_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.prayer_pool_items
           SET deleted_at = NEW.deleted_at, updated_at = now()
         WHERE pool_id = NEW.id AND deleted_at IS NULL;

        UPDATE public.prayer_pool_members
           SET deleted_at = NEW.deleted_at, updated_at = now()
         WHERE pool_id = NEW.id AND deleted_at IS NULL;
        -- Note: prayer_item_user_states are intentionally NOT deleted so users retain personal answered testimonies.
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_pool_soft_delete
AFTER UPDATE OF deleted_at ON public.prayer_pools
FOR EACH ROW EXECUTE FUNCTION public.cascade_pool_soft_delete();

-- 4. Auto-Provision Owner Membership on Pool Creation
CREATE OR REPLACE FUNCTION public.add_pool_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.prayer_pool_members (id, pool_id, user_id, role, joined_at, updated_at)
    VALUES (gen_random_uuid(), NEW.id, NEW.owner_user_id, 'OWNER', now(), now())
    ON CONFLICT (pool_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_add_pool_owner_member
AFTER INSERT ON public.prayer_pools
FOR EACH ROW EXECUTE FUNCTION public.add_pool_owner_member();
