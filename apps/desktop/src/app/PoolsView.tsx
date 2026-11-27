// FR-202 / FR-203 — Categorized prayer pools (desktop).
//
// Mirrors the mobile `PoolsScreen`: the user's owned + joined pools, and once a pool is opened its
// captured items with the per-user actions FR-203 needs (`pray_count+1`, private E2EE note,
// answered + testimony, archive). Pure presentation — every read/write goes through the headless
// prayer store (AGENTS.md rule 1); no repository is constructed and no SQL is written here.
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  AppError,
  AsyncStatus,
  PrayerCategory,
  PrayerPoolItemView,
  PrayerPoolView,
  PoolVisibility,
} from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const CATEGORIES: readonly PrayerCategory[] = [
  'ANXIETY',
  'GUIDANCE',
  'THANKSGIVING',
  'FAMILY',
  'FINANCE',
  'HEALING',
  'CUSTOM',
];

const CATEGORY_LABELS: Record<PrayerCategory, string> = {
  ANXIETY: 'Anxiety',
  GUIDANCE: 'Guidance',
  THANKSGIVING: 'Thanksgiving',
  FAMILY: 'Family',
  FINANCE: 'Finance',
  HEALING: 'Healing',
  CUSTOM: 'Custom',
};

const FIELD =
  'rounded-md border border-hairline bg-canvas px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent';
const PRIMARY =
  'rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40';
const OUTLINE =
  'rounded-pill border border-hairline px-lg py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40';
const CARD = 'flex flex-col gap-sm rounded-lg border border-hairline bg-surface p-lg';
const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';

function ChipRow<T extends string>({
  options,
  selected,
  labelFor,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  labelFor: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-sm">
      {options.map((option) => {
        const active = option === selected;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-pill border px-lg py-sm font-ui text-uiSm transition ${
              active
                ? 'border-transparent bg-accent text-canvas'
                : 'border-hairline text-ink-primary hover:text-ink-secondary'
            }`}
          >
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}

export function PoolsView() {
  const runtime = useCoreRuntime();
  const {
    pools,
    poolsStatus,
    poolsError,
    activePoolId,
    items,
    itemsStatus,
    itemsError,
    joinAvailable,
    joinStatus,
    joinError,
    shareCodeStatus,
    shareCodeError,
  } = useCoreStore(runtime.stores.prayer);
  const [userId, setUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<PrayerPoolItemView | null>(null);
  // The code returned by the owner's most recent `rotateShareCode`; the synced `shareCode` column
  // only catches up on the next PowerSync checkpoint, so this value keeps the UI honest meanwhile.
  const [freshShareCode, setFreshShareCode] = useState<string | null>(null);

  // Resolve the writing identity once: the signed-in account, else the device guest id (C4 §4.1).
  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  useEffect(() => {
    setFreshShareCode(null);
  }, [activePoolId]);

  useEffect(() => {
    if (userId !== null) void runtime.stores.prayer.getState().loadPools(userId);
  }, [runtime, userId]);

  const activePool = useMemo(
    () => pools.find((pool) => pool.id === activePoolId) ?? null,
    [pools, activePoolId],
  );

  const openPool = useCallback(
    (poolId: string) => {
      if (userId !== null) void runtime.stores.prayer.getState().openPool(userId, poolId);
    },
    [runtime, userId],
  );

  const closePool = useCallback(() => {
    // Returning to the list: nothing to fetch, the pools list is already loaded.
    runtime.stores.prayer.setState({ activePoolId: null, items: [], itemsStatus: 'idle' });
  }, [runtime]);

  const createPool = useCallback(
    async (input: { title: string; category: PrayerCategory; visibility: PoolVisibility }) => {
      if (userId === null) return;
      await runtime.stores.prayer.getState().createPool({
        ownerUserId: userId,
        title: input.title,
        category: input.category,
        visibility: input.visibility,
      });
      setCreateOpen(false);
    },
    [runtime, userId],
  );

  const joinPool = useCallback(
    async (code: string) => {
      if (userId === null) return;
      const joined = await runtime.stores.prayer.getState().joinPool(userId, code);
      if (joined !== null) setJoinOpen(false);
    },
    [runtime, userId],
  );

  const generateShareCode = useCallback(
    async (poolId: string) => {
      if (userId === null) return;
      const code = await runtime.stores.prayer.getState().rotateShareCode(userId, poolId);
      if (code !== null) setFreshShareCode(code);
    },
    [runtime, userId],
  );

  const copyShareCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access can be denied by the webview; the code stays selectable on screen.
    }
  }, []);

  const act = useCallback(
    async (item: PrayerPoolItemView, action: 'pray' | 'archive' | 'answer') => {
      if (userId === null) return;
      const store = runtime.stores.prayer.getState();
      if (action === 'pray') await store.recordPray(userId, item.itemId, item.poolId);
      if (action === 'archive')
        await store.setArchived(userId, item.itemId, item.poolId, !item.isArchived);
      if (action === 'answer') await store.markAnswered(userId, item.itemId, item.poolId);
    },
    [runtime, userId],
  );

  const saveNote = useCallback(
    async (note: string) => {
      if (userId === null || noteTarget === null) return;
      await runtime.stores.prayer
        .getState()
        .setNote(userId, noteTarget.itemId, noteTarget.poolId, note);
      setNoteTarget(null);
    },
    [runtime, userId, noteTarget],
  );

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <header className="flex items-center justify-between">
        <h2 className="font-ui text-uiLg text-ink-primary">
          {activePool === null ? 'Prayer Pools' : activePool.title}
        </h2>
        {activePool === null ? (
          <div className="flex items-center gap-sm">
            {joinAvailable && (
              <button type="button" onClick={() => setJoinOpen(true)} className={OUTLINE}>
                Join with a code
              </button>
            )}
            <button type="button" onClick={() => setCreateOpen(true)} className={PRIMARY}>
              New pool
            </button>
          </div>
        ) : (
          <button type="button" onClick={closePool} className={OUTLINE}>
            Back
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-md">
          {activePool === null ? (
            <>
              {poolsStatus === 'loading' && (
                <p className="font-ui text-uiSm text-ink-secondary">Loading pools…</p>
              )}
              {poolsError !== null && (
                <p className="font-ui text-uiSm text-ink-red" role="alert">
                  {poolsError.userMessage}
                </p>
              )}
              {poolsStatus === 'ready' && pools.length === 0 && (
                <p className="font-ui text-uiSm text-ink-secondary">
                  No pools yet. Create one to begin gathering passages to pray.
                </p>
              )}
              {pools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} onOpen={openPool} />
              ))}
            </>
          ) : (
            <>
              {activePool.userRole === 'OWNER' && (
                <ShareCodePanel
                  code={freshShareCode ?? activePool.shareCode ?? null}
                  status={shareCodeStatus}
                  error={shareCodeError}
                  onGenerate={() => void generateShareCode(activePool.id)}
                  onCopy={(code) => void copyShareCode(code)}
                />
              )}
              {itemsStatus === 'loading' && (
                <p className="font-ui text-uiSm text-ink-secondary">Loading passages…</p>
              )}
              {itemsError !== null && (
                <p className="font-ui text-uiSm text-ink-red" role="alert">
                  {itemsError.userMessage}
                </p>
              )}
              {itemsStatus === 'ready' && items.length === 0 && (
                <p className="font-ui text-uiSm text-ink-secondary">
                  No passages captured yet. Use Capture in the reader to add one.
                </p>
              )}
              {items.map((item) => (
                <ItemCard
                  key={item.itemId}
                  item={item}
                  onPray={() => void act(item, 'pray')}
                  onAnswer={() => void act(item, 'answer')}
                  onArchive={() => void act(item, 'archive')}
                  onEditNote={() => setNoteTarget(item)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {createOpen && (
        <CreatePoolDialog
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => void createPool(input)}
        />
      )}
      {joinOpen && (
        <JoinPoolDialog
          status={joinStatus}
          error={joinError}
          onClose={() => setJoinOpen(false)}
          onJoin={(code) => void joinPool(code)}
        />
      )}
      {noteTarget !== null && (
        <NoteDialog
          item={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSave={(note) => void saveNote(note)}
        />
      )}
    </section>
  );
}

function PoolCard({ pool, onOpen }: { pool: PrayerPoolView; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(pool.id)}
      className={`${CARD} items-start text-left transition hover:border-accent`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="font-ui text-uiMd text-ink-primary">{pool.title}</span>
        <span className="rounded-pill bg-elevated px-sm py-xxs font-ui text-uiXs text-ink-secondary">
          {pool.visibility === 'SHARED' ? 'Shared' : 'Private'}
        </span>
      </span>
      <span className="font-ui text-uiXs text-ink-secondary">
        {`${CATEGORY_LABELS[pool.category]} · ${pool.activeItemsCount} to pray · ${pool.answeredItemsCount} answered`}
      </span>
      {pool.visibility === 'SHARED' && (
        <span className="font-ui text-uiXs text-ink-secondary">
          {`${pool.memberCount} member${pool.memberCount === 1 ? '' : 's'}`}
        </span>
      )}
    </button>
  );
}

function ItemCard({
  item,
  onPray,
  onAnswer,
  onArchive,
  onEditNote,
}: {
  item: PrayerPoolItemView;
  onPray: () => void;
  onAnswer: () => void;
  onArchive: () => void;
  onEditNote: () => void;
}) {
  const answered = item.answeredAt !== undefined;
  return (
    <article className={CARD}>
      <div className="flex items-center justify-between">
        <span className="font-ui text-uiMd text-ink-primary">{item.passageReference}</span>
        <span className="font-ui text-uiXs text-ink-secondary">{`${item.prayCount}× prayed`}</span>
      </div>
      <p className="font-scripture text-uiMd leading-relaxed text-ink-primary">{item.capturedText}</p>
      {item.userNotes !== undefined && item.userNotes.length > 0 && (
        <p className="font-ui text-uiSm text-ink-secondary">{`Note: ${item.userNotes}`}</p>
      )}
      {answered && <p className="font-ui text-uiXs text-accent">Answered</p>}
      <div className="mt-xs flex flex-wrap gap-sm">
        <ActionChip label="Pray" onPress={onPray} />
        <ActionChip
          label={item.userNotes === undefined ? 'Add note' : 'Edit note'}
          onPress={onEditNote}
        />
        <ActionChip
          label={answered ? 'Answered' : 'Mark answered'}
          onPress={onAnswer}
          disabled={answered}
        />
        <ActionChip label={item.isArchived ? 'Unarchive' : 'Archive'} onPress={onArchive} />
      </div>
    </article>
  );
}

function ShareCodePanel({
  code,
  status,
  error,
  onGenerate,
  onCopy,
}: {
  code: string | null;
  status: AsyncStatus;
  error: AppError | null;
  onGenerate: () => void;
  onCopy: (code: string) => void;
}) {
  const busy = status === 'loading';
  return (
    <div className="flex flex-col gap-sm rounded-lg border border-accent bg-surface p-lg">
      <span className={SECTION_LABEL}>Share code</span>
      {code !== null ? (
        <>
          <p
            aria-label={`Share code ${code}`}
            className="select-all font-ui text-uiLg tracking-widest text-ink-primary"
          >
            {code}
          </p>
          <p className="font-ui text-uiSm text-ink-secondary">
            Anyone with this 8-character code can join and see this pool’s passages.
          </p>
          <div className="flex flex-wrap gap-sm">
            <ActionChip label="Copy code" onPress={() => onCopy(code)} />
            <ActionChip
              label={busy ? 'Working…' : 'New code'}
              onPress={onGenerate}
              disabled={busy}
            />
          </div>
        </>
      ) : (
        <>
          <p className="font-ui text-uiSm text-ink-secondary">
            Create a code so others can join this pool.
          </p>
          <button type="button" onClick={onGenerate} disabled={busy} className={PRIMARY}>
            {busy ? 'Creating…' : 'Create share code'}
          </button>
        </>
      )}
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}
    </div>
  );
}

function ActionChip({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onPress} disabled={disabled === true} className={OUTLINE}>
      {label}
    </button>
  );
}

function CreatePoolDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { title: string; category: PrayerCategory; visibility: PoolVisibility }) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PrayerCategory>('GUIDANCE');
  const [visibility, setVisibility] = useState<PoolVisibility>('PRIVATE');

  const canCreate = title.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-elevated"
      role="dialog"
      aria-modal="true"
      aria-label="New pool"
    >
      <div className="flex w-full max-w-lg flex-col gap-md rounded-lg border border-hairline bg-surface p-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-ui text-uiLg text-ink-primary">New pool</h3>
          <button type="button" onClick={onClose} className={OUTLINE}>
            Close
          </button>
        </div>
        <label className="flex flex-col gap-xxs">
          <span className={SECTION_LABEL}>Name</span>
          <input
            className={FIELD}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pool name"
          />
        </label>
        <div className="flex flex-col gap-xxs">
          <span className={SECTION_LABEL}>Category</span>
          <ChipRow
            options={CATEGORIES}
            selected={category}
            labelFor={(value) => CATEGORY_LABELS[value]}
            onSelect={setCategory}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <span className={SECTION_LABEL}>Visibility</span>
          <ChipRow
            options={['PRIVATE', 'SHARED'] as const}
            selected={visibility}
            labelFor={(value) => (value === 'SHARED' ? 'Shared' : 'Private')}
            onSelect={setVisibility}
          />
        </div>
        <button
          type="button"
          onClick={() => onCreate({ title: title.trim(), category, visibility })}
          disabled={!canCreate}
          className={PRIMARY}
        >
          Create pool
        </button>
      </div>
    </div>
  );
}

function JoinPoolDialog({
  status,
  error,
  onClose,
  onJoin,
}: {
  status: AsyncStatus;
  error: AppError | null;
  onClose: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  const submitting = status === 'loading';
  const canSubmit = code.trim().length > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-elevated"
      role="dialog"
      aria-modal="true"
      aria-label="Join a pool"
    >
      <div className="flex w-full max-w-lg flex-col gap-md rounded-lg border border-hairline bg-surface p-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-ui text-uiLg text-ink-primary">Join a pool</h3>
          <button type="button" onClick={onClose} className={OUTLINE}>
            Close
          </button>
        </div>
        <p className="font-ui text-uiSm text-ink-secondary">
          Enter the 8-character code your group leader shared. The pool appears once it syncs.
        </p>
        <label className="flex flex-col gap-xxs">
          <span className={SECTION_LABEL}>Share code</span>
          <input
            className={FIELD}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            maxLength={8}
            placeholder="e.g. K9P4M2X7"
          />
        </label>
        {error !== null && (
          <p className="font-ui text-uiSm text-ink-red" role="alert">
            {error.userMessage}
          </p>
        )}
        <button
          type="button"
          onClick={() => onJoin(code)}
          disabled={!canSubmit}
          className={PRIMARY}
        >
          {submitting ? 'Joining…' : 'Join pool'}
        </button>
      </div>
    </div>
  );
}

function NoteDialog({
  item,
  onClose,
  onSave,
}: {
  item: PrayerPoolItemView;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(item.userNotes ?? '');

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-elevated"
      role="dialog"
      aria-modal="true"
      aria-label="Private note"
    >
      <div className="flex w-full max-w-lg flex-col gap-md rounded-lg border border-hairline bg-surface p-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-ui text-uiLg text-ink-primary">Private note</h3>
          <button type="button" onClick={onClose} className={OUTLINE}>
            Close
          </button>
        </div>
        <p className="font-ui text-uiSm text-ink-secondary">
          Stored encrypted in your private vault — never shared with the pool.
        </p>
        <textarea
          className={`${FIELD} min-h-24 resize-y`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What are you holding before God?"
        />
        <button type="button" onClick={() => onSave(note)} className={PRIMARY}>
          Save note
        </button>
      </div>
    </div>
  );
}
