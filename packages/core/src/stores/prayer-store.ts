// B3 §4.1 `stores/` / §4.2 rule 2 — headless prayer store (FR-201..203).
//
// A framework-free `zustand/vanilla` store the UI subscribes to. It wraps
// `PrayerPoolRepository`, never writes SQL (AGENTS.md rule 1) and never throws — failures land in
// `error` as a canonical `AppError` (rule 7). Selectors expose pools, the active pool's items and
// the rotation queue; the DEK is never surfaced here (private fields arrive already decrypted in
// memory, or as `undefined` when the vault is locked).

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { JoinedPool, PoolShareAdapter } from '../adapters';
import { AppError, asAppError, type AppErrorFallback } from '../errors/AppError';
import { poolJoinError, poolShareCodeError, POOL_JOIN_AUTH_REQUIRED_FALLBACK } from '../pools';
import type {
  AddPoolItemParams,
  CreatePoolParams,
  PrayerPoolRepository,
  UpdatePoolParams,
} from '../repositories/prayer-pool-repository';
import type { PrayerPoolItemView, PrayerPoolView } from '../domain/types';

import type { AsyncStatus } from './types';

const PRAYER_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'This prayer action could not be completed. Please try again.',
};

export interface PrayerStoreState {
  readonly pools: readonly PrayerPoolView[];
  readonly poolsStatus: AsyncStatus;
  readonly poolsError: AppError | null;
  /** The pool whose items are currently loaded. */
  readonly activePoolId: string | null;
  readonly items: readonly PrayerPoolItemView[];
  readonly itemsStatus: AsyncStatus;
  readonly itemsError: AppError | null;
  /** FR-203 — the next session queue for the active pool. */
  readonly rotationQueue: readonly PrayerPoolItemView[];
  readonly rotationStatus: AsyncStatus;
  /** False when no shared-pool transport is injected — the “Join by code” surface stays hidden. */
  readonly joinAvailable: boolean;
  /** In-flight state of the most recent `joinPool` call (FR-202 / C4 §4.3). */
  readonly joinStatus: AsyncStatus;
  readonly joinError: AppError | null;
  /** In-flight state of the most recent `rotateShareCode` call (FR-202 / C4 §4.4). */
  readonly shareCodeStatus: AsyncStatus;
  readonly shareCodeError: AppError | null;
}

export interface PrayerStoreActions {
  /** FR-201/202 — load the user's pools (owned + joined). */
  loadPools(userId: string): Promise<readonly PrayerPoolView[]>;
  /** FR-202 — create a pool, then refresh the list. */
  createPool(params: CreatePoolParams): Promise<PrayerPoolView | null>;
  /** FR-202 — update a pool's metadata, then refresh the list. */
  updatePool(poolId: string, patch: UpdatePoolParams): Promise<void>;
  /** FR-202 — delete a pool (soft), then refresh the list. */
  deletePool(poolId: string): Promise<void>;
  /** FR-202 — open a pool's items into `items`. */
  openPool(userId: string, poolId: string): Promise<readonly PrayerPoolItemView[]>;
  /** Re-read the active pool's items. */
  refreshItems(userId: string): Promise<readonly PrayerPoolItemView[]>;
  /** FR-201 — capture a passage into a pool, then refresh the items. */
  capture(userId: string, params: AddPoolItemParams): Promise<PrayerPoolItemView | null>;
  /** FR-202 — write the user's private E2EE note, then refresh the items. */
  setNote(userId: string, itemId: string, poolId: string, note: string): Promise<void>;
  /** FR-203 — record one prayer, then refresh the items and queue. */
  recordPray(userId: string, itemId: string, poolId: string): Promise<void>;
  /** FR-203 — mark answered (optional E2EE testimony), then refresh. */
  markAnswered(userId: string, itemId: string, poolId: string, testimony?: string): Promise<void>;
  /** Archive / unarchive a card for the user, then refresh. */
  setArchived(userId: string, itemId: string, poolId: string, archived: boolean): Promise<void>;
  /** FR-203 — load the active pool's next session queue. */
  loadRotationQueue(userId: string, poolId: string, limit?: number): Promise<readonly PrayerPoolItemView[]>;
  /**
   * FR-202 / C4 §4.3 — join a shared pool by its 8-char code via the injected `PoolShareAdapter`,
   * then refresh the pool list. Returns `null` (with `joinError` set) when no transport is
   * injected or the RPC is rejected; the joined pool itself appears once PowerSync syncs it down.
   */
  joinPool(userId: string, code: string): Promise<JoinedPool | null>;
  /**
   * FR-202 / C4 §4.4 — owner-only: mint (or regenerate) the pool's 8-char share code via the
   * injected `PoolShareAdapter`, then refresh the pool list (the pool flips to `SHARED`). Returns
   * the new code, or `null` (with `shareCodeError` set) when no transport is injected or the RPC
   * is rejected. The returned code is authoritative — the synced `shareCode` only lands on the
   * next checkpoint, so the UI shows this value immediately.
   */
  rotateShareCode(userId: string, poolId: string): Promise<string | null>;
}

export type PrayerStore = StoreApi<PrayerStoreState & PrayerStoreActions>;

const INITIAL_STATE: PrayerStoreState = {
  pools: [],
  poolsStatus: 'idle',
  poolsError: null,
  activePoolId: null,
  items: [],
  itemsStatus: 'idle',
  itemsError: null,
  rotationQueue: [],
  rotationStatus: 'idle',
  joinAvailable: false,
  joinStatus: 'idle',
  joinError: null,
  shareCodeStatus: 'idle',
  shareCodeError: null,
};

export function createPrayerStore(
  repository: PrayerPoolRepository,
  poolShare: PoolShareAdapter | null = null,
): PrayerStore {
  return createStore<PrayerStoreState & PrayerStoreActions>()((set, get) => ({
    ...INITIAL_STATE,
    joinAvailable: poolShare !== null,

    async loadPools(userId) {
      set({ poolsStatus: 'loading', poolsError: null });
      try {
        const pools = await repository.listPoolsForUser(userId);
        set({ pools, poolsStatus: 'ready' });
        return pools;
      } catch (error) {
        set({ pools: [], poolsStatus: 'error', poolsError: asAppError(error, PRAYER_FAILURE) });
        return [];
      }
    },

    async createPool(params) {
      try {
        const record = await repository.createPool(params);
        const pools = await get().loadPools(params.ownerUserId);
        return pools.find((pool) => pool.id === record.id) ?? null;
      } catch (error) {
        set({ poolsStatus: 'error', poolsError: asAppError(error, PRAYER_FAILURE) });
        return null;
      }
    },

    async updatePool(poolId, patch) {
      try {
        await repository.updatePool(poolId, patch);
        set((state) => ({
          pools: state.pools.map((pool) =>
            pool.id === poolId ? applyPoolPatch(pool, patch) : pool,
          ),
        }));
      } catch (error) {
        set({ poolsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async deletePool(poolId) {
      try {
        await repository.softDeletePool(poolId);
        set((state) => ({
          pools: state.pools.filter((pool) => pool.id !== poolId),
          ...(state.activePoolId === poolId
            ? { activePoolId: null, items: [], itemsStatus: 'idle' as AsyncStatus }
            : {}),
        }));
      } catch (error) {
        set({ poolsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async openPool(userId, poolId) {
      set({ activePoolId: poolId, itemsStatus: 'loading', itemsError: null });
      try {
        const items = await repository.listItems(userId, poolId);
        set({ items, itemsStatus: 'ready' });
        return items;
      } catch (error) {
        set({ items: [], itemsStatus: 'error', itemsError: asAppError(error, PRAYER_FAILURE) });
        return [];
      }
    },

    async refreshItems(userId) {
      const poolId = get().activePoolId;
      if (poolId === null) {
        return [];
      }
      return get().openPool(userId, poolId);
    },

    async capture(userId, params) {
      try {
        const item = await repository.addItem(params);
        await get().openPool(userId, params.poolId);
        return item;
      } catch (error) {
        set({ itemsStatus: 'error', itemsError: asAppError(error, PRAYER_FAILURE) });
        return null;
      }
    },

    async setNote(userId, itemId, poolId, note) {
      try {
        await repository.setUserNote(userId, itemId, poolId, note);
        await get().refreshItems(userId);
      } catch (error) {
        set({ itemsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async recordPray(userId, itemId, poolId) {
      try {
        await repository.recordPray(userId, itemId, poolId);
        await get().refreshItems(userId);
      } catch (error) {
        set({ itemsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async markAnswered(userId, itemId, poolId, testimony) {
      try {
        await repository.markAnswered(userId, itemId, poolId, testimony);
        await get().refreshItems(userId);
      } catch (error) {
        set({ itemsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async setArchived(userId, itemId, poolId, archived) {
      try {
        await repository.setArchived(userId, itemId, poolId, archived);
        await get().refreshItems(userId);
      } catch (error) {
        set({ itemsError: asAppError(error, PRAYER_FAILURE) });
      }
    },

    async loadRotationQueue(userId, poolId, limit) {
      set({ rotationStatus: 'loading' });
      try {
        const rotationQueue = await repository.getRotationQueue(userId, poolId, limit);
        set({ rotationQueue, rotationStatus: 'ready' });
        return rotationQueue;
      } catch {
        set({ rotationQueue: [], rotationStatus: 'error' });
        return [];
      }
    },

    async joinPool(userId, code) {
      if (poolShare === null) {
        set({
          joinStatus: 'error',
          joinError: new AppError(POOL_JOIN_AUTH_REQUIRED_FALLBACK),
        });
        return null;
      }
      set({ joinStatus: 'loading', joinError: null });
      try {
        const joined = await poolShare.joinSharedPoolByCode(code.trim());
        // The membership row is written server-side; the joined pool surfaces once PowerSync
        // syncs it into `joined_pools`, so this refresh may legitimately come back empty.
        await get().loadPools(userId);
        set({ joinStatus: 'ready' });
        return joined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          joinStatus: 'error',
          joinError: poolJoinError(message, error) ?? asAppError(error, PRAYER_FAILURE),
        });
        return null;
      }
    },

    async rotateShareCode(userId, poolId) {
      if (poolShare === null) {
        set({
          shareCodeStatus: 'error',
          shareCodeError: new AppError(POOL_JOIN_AUTH_REQUIRED_FALLBACK),
        });
        return null;
      }
      set({ shareCodeStatus: 'loading', shareCodeError: null });
      try {
        const code = await poolShare.rotatePoolShareCode(poolId);
        // The RPC flips the pool to SHARED server-side; the refreshed local list still shows the
        // old row until the next sync, so the caller renders the returned code directly.
        await get().loadPools(userId);
        set({ shareCodeStatus: 'ready' });
        return code;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          shareCodeStatus: 'error',
          shareCodeError: poolShareCodeError(message, error) ?? asAppError(error, PRAYER_FAILURE),
        });
        return null;
      }
    },
  }));
}

function applyPoolPatch(pool: PrayerPoolView, patch: UpdatePoolParams): PrayerPoolView {
  return {
    ...pool,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.category === undefined ? {} : { category: patch.category }),
    ...(patch.colorHex === undefined ? {} : { colorHex: patch.colorHex }),
    ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
    ...(patch.allowMemberContributions === undefined
      ? {}
      : { allowMemberContributions: patch.allowMemberContributions }),
  };
}
