-- ============================================================================
-- rls_and_rpcs.test.sql — F1 §4 "suite 4": Supabase RLS & RPC acceptance tests.
--
-- Authority: C4 §4.3 (RLS matrix) + §4.4 (anti-enumeration RPCs), F1 §4 (suite 4),
--            B6 §4.1 (Spoofing / Elevation of Privilege controls), plan task P2-15.
--
-- Run against a local Supabase stack:
--     supabase db start          # only the Postgres container is needed for pgTAP
--     supabase db reset          # applies supabase/migrations/*.sql + seed.sql
--     supabase test db           # executes every supabase/tests/*.sql via pgTAP
--
-- (`supabase start` also works, but it pulls the whole service stack; the DB-only
-- stack is enough because these assertions talk to Postgres directly.)
--
-- Tenancy model under test (C4 §4.3):
--     User A — OWNER of the shared pool
--     User B — MEMBER of the pool      (leader-curated: allow_member_contributions = false)
--     User C — OUTSIDER, later joins through the share-code RPC
--
-- The whole file runs inside one transaction and rolls back, so it is idempotent
-- and leaves the local database untouched.
-- ============================================================================

begin;

-- pgTAP ships with the local Supabase image.
create extension if not exists pgtap;
set search_path = public, extensions;

select plan(34);

-- ============================================================================
-- Fixtures — inserted as the superuser (bypasses RLS). Rolled back at the end.
-- ============================================================================
insert into public.user_profiles (id) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),  -- A
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),  -- B
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');  -- C

insert into public.prayer_pools
    (id, owner_user_id, title, category, visibility, share_code, allow_member_contributions)
values
    ('11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'Sunday Small Group', 'CUSTOM', 'SHARED', 'ABCD2345', false);
-- `trg_add_pool_owner_member` (0002) auto-created A's OWNER membership row.

insert into public.prayer_pool_members (id, pool_id, user_id, role) values
    ('55555555-5555-4555-8555-555555555555',
     '11111111-1111-4111-8111-111111111111',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'MEMBER');

insert into public.prayer_pool_items
    (id, pool_id, created_by_user_id, start_verse_id, end_verse_id,
     translation_code, captured_text, shared_prompt_text)
values
    ('22222222-2222-4222-8222-222222222222',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     50004006, 50004006, 'BSB',
     'Be anxious for nothing, but in everything by prayer and supplication...',
     'Pray for one another''s peace this week.');

insert into public.prayer_item_user_states
    (id, item_id, pool_id, user_id, user_notes_payload) values
    ('33333333-3333-4333-8333-333333333331',
     '22222222-2222-4222-8222-222222222222',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A: private confession'),
    ('33333333-3333-4333-8333-333333333332',
     '22222222-2222-4222-8222-222222222222',
     '11111111-1111-4111-8111-111111111111',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B: private confession');

insert into public.highlights
    (id, user_id, translation_code, start_verse_id, end_verse_id, color_hex) values
    ('44444444-4444-4444-8444-444444444444',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BSB', 50004006, 50004006, '#FFD400');

-- ---------------------------------------------------------------------------
-- Identity harness. `auth.uid()` reads the `request.jwt.claims` GUC, so each
-- role block is simulated by SET LOCAL role + claims inside this transaction.
-- ---------------------------------------------------------------------------
-- Values: any 'sub' present -> that user; claims = '' -> unauthenticated.
-- (SET LOCAL persists until the end of the transaction; RESET ROLE only swaps role.)

-- Probe helper: normalises the RPC's failure mode so the suite is agnostic to
-- whether `join_shared_pool_by_code` raises or returns an `{ "error": ... }` body.
-- A raised exception is caught here, which rolls back anything the RPC wrote in
-- THIS transaction — that is deliberate: it is exactly what exposes whether the
-- failed attempt was durably recorded.
create or replace function public.test_join_code(p_code text)
returns text language plpgsql security invoker set search_path = public as $$
declare
    v jsonb;
begin
    v := public.join_shared_pool_by_code(p_code);
    return coalesce(v ->> 'error', 'OK');
exception when others then
    return sqlerrm;
end;
$$;
grant execute on function public.test_join_code(text) to authenticated;

-- ============================================================================
-- 1. User A — OWNER (6 assertions)
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select count(*) from public.prayer_pools)::int, 1,
    'A(owner) reads the pool they own');
select is((select count(*) from public.prayer_pool_items)::int, 1,
    'A(owner) reads the pool items');
select is((select count(*) from public.prayer_pool_members)::int, 2,
    'A(owner) reads the full roster (owner + member)');
select is((select count(*) from public.prayer_item_user_states)::int, 1,
    'A(owner) sees only their OWN item state');
select is((select count(*) from public.highlights)::int, 1,
    'A(owner) reads their own highlight');
with upd as (
    update public.prayer_pools
       set title = 'Renamed by owner'
     where id = '11111111-1111-4111-8111-111111111111'
    returning 1
)
select is((select count(*) from upd)::int, 1,
    'A(owner) may update the pool');

-- ============================================================================
-- 2. User B — MEMBER of a leader-curated pool (8 assertions)
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is((select count(*) from public.prayer_pools)::int, 1,
    'B(member) reads the pool they joined');
select is((select count(*) from public.prayer_pool_items)::int, 1,
    'B(member) reads the pool items');
select is((select count(*) from public.prayer_pool_members)::int, 2,
    'B(member) reads the roster');
select is((select count(*) from public.prayer_item_user_states)::int, 1,
    'B(member) sees only their OWN item state — A''s note is invisible');
select is((select count(*) from public.highlights)::int, 0,
    'B(member) cannot read A''s highlight');
select is((select shared_prompt_text from public.prayer_pool_items limit 1),
    'Pray for one another''s peace this week.',
    'B(member) reads the leader''s shared prompt');
with upd as (
    update public.prayer_pools
       set title = 'HACKED by member'
     where id = '11111111-1111-4111-8111-111111111111'
    returning 1
)
select is((select count(*) from upd)::int, 0,
    'B(member) cannot update the pool (RLS filters the row)');
select throws_ok($$
    insert into public.prayer_pool_items
        (id, pool_id, created_by_user_id, start_verse_id, end_verse_id,
         translation_code, captured_text)
    values
        ('66666666-6666-4666-8666-666666666666',
         '11111111-1111-4111-8111-111111111111',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         50004006, 50004006, 'BSB', 'member-authored item')
$$, '42501', NULL,
    'B(member) cannot insert into a leader-curated pool (RLS WITH CHECK)');

-- ============================================================================
-- 3. User C — OUTSIDER (4 assertions)
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

select is((select count(*) from public.prayer_pools)::int, 0,
    'C(outsider) reads no pools');
select is((select count(*) from public.prayer_pool_items)::int, 0,
    'C(outsider) reads no pool items');
select is((select count(*) from public.prayer_pool_members)::int, 0,
    'C(outsider) reads no roster');
select is((select count(*) from public.prayer_item_user_states)::int, 0,
    'C(outsider) reads no item states');

-- ============================================================================
-- 4. join_shared_pool_by_code RPC — anti-enumeration (12 assertions)
-- ============================================================================
-- Still acting as C. The valid join must run BEFORE the failed-attempt storm and
-- BEFORE the cascade, because it flips C into a MEMBER of the pool.
select is((public.join_shared_pool_by_code('abcd2345') ->> 'role'), 'MEMBER',
    'RPC: valid share code joins as MEMBER (case-insensitive, trimmed)');
select is((select count(*) from public.prayer_pools)::int, 1,
    'RPC: after joining, C reads the pool');
select is((select count(*) from public.prayer_pool_members)::int, 3,
    'RPC: after joining, C reads the full roster (A, B, C)');

-- Five failed attempts must each surface POOL_SHARE_CODE_INVALID and be recorded;
-- the sixth call inside the 15-minute window must be throttled.
select is(public.test_join_code('WRONG001'), 'POOL_SHARE_CODE_INVALID',
    'RPC: failed attempt 1 → POOL_SHARE_CODE_INVALID');
select is(public.test_join_code('WRONG002'), 'POOL_SHARE_CODE_INVALID',
    'RPC: failed attempt 2 → POOL_SHARE_CODE_INVALID');
select is(public.test_join_code('WRONG003'), 'POOL_SHARE_CODE_INVALID',
    'RPC: failed attempt 3 → POOL_SHARE_CODE_INVALID');
select is(public.test_join_code('WRONG004'), 'POOL_SHARE_CODE_INVALID',
    'RPC: failed attempt 4 → POOL_SHARE_CODE_INVALID');
select is(public.test_join_code('WRONG005'), 'POOL_SHARE_CODE_INVALID',
    'RPC: failed attempt 5 → POOL_SHARE_CODE_INVALID');
select is(public.test_join_code('WRONG006'), 'POOL_JOIN_RATE_LIMITED',
    'RPC: 6th failed attempt within 15 min → POOL_JOIN_RATE_LIMITED');

-- Unauthenticated callers are rejected before any lookup.
set local request.jwt.claims = '';
select is(public.test_join_code('ABCD2345'), 'AUTH_REQUIRED',
    'RPC: unauthenticated caller → AUTH_REQUIRED');

-- Owner-only share-code rotation.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select matches(public.rotate_pool_share_code('11111111-1111-4111-8111-111111111111'),
    '^[0-9A-HJKMNP-TV-Z]{8}$',
    'RPC: owner rotates the share code → 8-char Crockford Base32');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok($$
    select public.rotate_pool_share_code('11111111-1111-4111-8111-111111111111')
$$, 'P0001', 'POOL_PERMISSION_DENIED',
    'RPC: non-owner rotate → POOL_PERMISSION_DENIED');

-- ============================================================================
-- 5. cascade_pool_soft_delete trigger (4 assertions)
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

with del as (
    update public.prayer_pools
       set deleted_at = now()
     where id = '11111111-1111-4111-8111-111111111111'
    returning 1
)
select is((select count(*) from del)::int, 1,
    'A(owner) soft-deletes the pool');

reset role;  -- back to the superuser for a clear, RLS-free view of the result
select is((select count(*) from public.prayer_pool_items
            where pool_id = '11111111-1111-4111-8111-111111111111'
              and deleted_at is not null)::int, 1,
    'cascade: pool items are tombstoned with the pool');
select is((select count(*) from public.prayer_pool_members
            where pool_id = '11111111-1111-4111-8111-111111111111'
              and deleted_at is not null)::int, 3,
    'cascade: pool memberships are tombstoned with the pool');
select is((select count(*) from public.prayer_item_user_states
            where pool_id = '11111111-1111-4111-8111-111111111111'
              and deleted_at is null)::int, 2,
    'cascade: personal item states are PRESERVED (answered testimonies retained)');

select * from finish();
rollback;
