// PoolShareAdapter — the Supabase RPC transport seam for shared-pool joins (FR-202, C4 §4.3).
//
// `packages/core` stays transport-free (B3 §4.3); this adapter is the only place the mobile app
// calls `join_shared_pool_by_code`. It reuses the shared Supabase client so the JWT that signs the
// RPC is the same session PowerSync syncs the resulting membership under.
//
// The RPC has two failure shapes (`C4 §4.4` / migration 0004): a bad code is *returned* as
// `{ "error": "POOL_SHARE_CODE_INVALID" }` (so the failed-attempt log commits), while
// `AUTH_REQUIRED` / `POOL_JOIN_RATE_LIMITED` are raised; both reach `packages/core` as an error
// whose message carries the code for `poolJoinError` to map.
//
// Env-guarded (`Plan §6`): when unprovisioned `createPoolShareAdapter()` returns `null`, the prayer
// store reports `joinAvailable: false` and hides the “Join by code” surface.

import type { JoinedPool, PoolShareAdapter } from '@breath-and-word/core';

import { getSupabaseClient } from './supabase-client';

type JoinRpcResult =
  | { poolId: string; title: string; role: JoinedPool['role'] }
  | { error: string };

/** Build the mobile `PoolShareAdapter`, or `null` when the Supabase endpoints are absent. */
export function createPoolShareAdapter(): PoolShareAdapter | null {
  const supabase = getSupabaseClient();
  if (supabase === null) {
    return null;
  }

  return {
    async joinSharedPoolByCode(code) {
      const { data, error } = await supabase.rpc('join_shared_pool_by_code', { p_code: code });
      if (error !== null) {
        throw new Error(error.message);
      }
      const result = data as JoinRpcResult;
      if ('error' in result) {
        throw new Error(result.error);
      }
      return { poolId: result.poolId, title: result.title, role: result.role };
    },

    async rotatePoolShareCode(poolId) {
      const { data, error } = await supabase.rpc('rotate_pool_share_code', { p_pool_id: poolId });
      if (error !== null) {
        throw new Error(error.message);
      }
      return data as string;
    },
  };
}
