// FR-203 — Prayer Rotation Deck (desktop).
//
// Mirrors the mobile `PrayerSessionScreen`: a 5-minute guided session over the active pool's
// rotation queue. The top card is drag-animated with framer-motion; once a drag passes the
// threshold its `pray_count` is recorded and the next card is revealed, so prayed cards fall to
// the back of the next queue because the repository orders by `last_prayed_at`. A Reduced Motion
// fallback (AGENTS.md rule 6) removes the card tilt and settles instantly. All reads/writes go
// through the headless prayer store (AGENTS.md rule 1) — no repository is constructed and no SQL.
import { useCallback, useEffect, useState } from 'react';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

import type { PrayerPoolView } from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

/** FR-203 — the deck session length (5 minutes). */
const SESSION_SECONDS = 5 * 60;
/** Horizontal drag distance that commits a swipe. */
const SWIPE_THRESHOLD = 110;
/** Distance the card travels off-screen once a swipe commits. */
const CARD_EXIT = 640;
/** Max card tilt (degrees) at full drag. */
const MAX_TILT_DEG = 12;

type SwipeDirection = 'prayed' | 'skipped';

const PRIMARY =
  'rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40';
const OUTLINE =
  'rounded-pill border border-hairline px-xl py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40';
const CARD = 'flex w-full max-w-xl flex-col gap-md rounded-lg border border-hairline bg-surface p-xl';

export function PrayerSessionView() {
  const runtime = useCoreRuntime();
  const { pools, rotationQueue, rotationStatus } = useCoreStore(runtime.stores.prayer);
  const [userId, setUserId] = useState<string | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  /** The card whose testimony sheet is open, identified by pool-item id. */
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [testimony, setTestimony] = useState('');

  // Resolve the writing identity once so pools/captures are attributable to the account (C4 §4.1).
  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  useEffect(() => {
    if (userId === null) return;
    void runtime.stores.prayer.getState().loadPools(userId);
  }, [userId, runtime]);

  // The 5-minute countdown; idle while paused or once the queue is exhausted.
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (secondsLeft === 0 && running) {
      setRunning(false);
      void runtime.repositories.prayerEngine.logSession({
        userId: userId ?? 'guest',
        framework: 'DECK',
        durationSeconds: SESSION_SECONDS,
        ...(poolId === null ? {} : { poolId }),
      });
    }
  }, [secondsLeft, running, runtime, userId, poolId]);

  const startSession = useCallback(
    (id: string) => {
      if (userId === null) return;
      setPoolId(id);
      setIndex(0);
      setSecondsLeft(SESSION_SECONDS);
      setRunning(true);
      void runtime.stores.prayer.getState().openPool(userId, id);
      void runtime.stores.prayer.getState().loadRotationQueue(userId, id);
    },
    [userId, runtime],
  );

  const advance = useCallback(
    (direction: SwipeDirection) => {
      const item = rotationQueue[index];
      if (direction === 'prayed' && userId !== null && poolId !== null && item !== undefined) {
        void runtime.stores.prayer.getState().recordPray(userId, item.itemId, poolId);
      }
      setIndex((value) => value + 1);
    },
    [rotationQueue, index, userId, poolId, runtime],
  );

  const submitTestimony = useCallback(async () => {
    const item = rotationQueue[index];
    if (userId === null || poolId === null || item === undefined || item.itemId !== answeringId) {
      return;
    }
    const note = testimony.trim();
    await runtime.stores.prayer
      .getState()
      .markAnswered(userId, item.itemId, poolId, note === '' ? undefined : note);
    setAnsweringId(null);
    setTestimony('');
    setIndex((value) => value + 1);
  }, [rotationQueue, index, userId, poolId, answeringId, testimony, runtime]);

  const current = rotationQueue[index];
  const finished = poolId !== null && (current === undefined || secondsLeft === 0);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const clock = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <header className="flex items-baseline justify-between">
        <h2 className="font-ui text-uiLg text-ink-primary">Prayer Session</h2>
        {poolId !== null && (
          <p aria-live="polite" className="font-ui text-uiSm text-ink-secondary">
            {`${clock} · ${index} prayed`}
          </p>
        )}
      </header>

      {poolId === null && (
        <div className="flex flex-col gap-sm">
          <p className="font-ui text-uiSm text-ink-secondary">
            Choose a pool to begin a 5-minute rotation.
          </p>
          {pools.length === 0 && (
            <p className="font-ui text-uiSm text-ink-secondary">
              Create a pool and capture a passage first.
            </p>
          )}
          {pools.map((pool) => (
            <PoolButton key={pool.id} pool={pool} onPress={() => startSession(pool.id)} />
          ))}
        </div>
      )}

      {poolId !== null && rotationStatus === 'loading' && (
        <p className="font-ui text-uiSm text-ink-secondary">Shuffling…</p>
      )}

      {poolId !== null && !finished && current !== undefined && (
        <div className="flex flex-1 items-center justify-center">
          <DeckCard
            key={current.itemId}
            reference={current.passageReference}
            text={current.capturedText}
            note={current.userNotes}
            prayCount={current.prayCount}
            onSwiped={advance}
            onAnswer={() => setAnsweringId(current.itemId)}
          />
        </div>
      )}

      {finished && (
        <div className="flex flex-col items-start gap-lg">
          <p className="font-ui text-uiMd text-ink-primary">Session complete</p>
          <p className="font-ui text-uiSm text-ink-secondary">
            {`You prayed through ${Math.min(index, rotationQueue.length)} ${
              Math.min(index, rotationQueue.length) === 1 ? 'passage' : 'passages'
            }. There is nothing to catch up on — return whenever you are ready.`}
          </p>
          <button
            type="button"
            onClick={() => {
              setPoolId(null);
              setIndex(0);
              setSecondsLeft(SESSION_SECONDS);
            }}
            className={PRIMARY}
          >
            Done
          </button>
        </div>
      )}

      {poolId !== null && !finished && (
        <button type="button" onClick={() => setRunning((value) => !value)} className={OUTLINE}>
          {running ? 'Pause' : 'Resume'}
        </button>
      )}

      {answeringId !== null && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-elevated"
          role="dialog"
          aria-modal="true"
          aria-label="Mark answered"
        >
          <div className="flex w-full max-w-lg flex-col gap-md rounded-lg border border-hairline bg-surface p-xl">
            <h3 className="font-ui text-uiLg text-ink-primary">Mark answered</h3>
            <p className="font-ui text-uiSm text-ink-secondary">
              Add a testimony to remember how God answered. It is stored encrypted in your private
              vault.
            </p>
            <textarea
              className="min-h-24 resize-y rounded-md border border-hairline bg-canvas px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent"
              value={testimony}
              onChange={(e) => setTestimony(e.target.value)}
              placeholder="What happened?"
            />
            <div className="flex justify-end gap-sm">
              <button type="button" onClick={() => setAnsweringId(null)} className={OUTLINE}>
                Cancel
              </button>
              <button type="button" onClick={() => void submitTestimony()} className={PRIMARY}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PoolButton({ pool, onPress }: { pool: PrayerPoolView; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex flex-col items-start gap-xxs rounded-md border border-hairline bg-surface px-lg py-sm text-left transition hover:border-accent"
    >
      <span className="font-ui text-uiSm text-ink-primary">{pool.title}</span>
      <span className="font-ui text-uiXs text-ink-secondary">{`${pool.activeItemsCount} to pray`}</span>
    </button>
  );
}

interface DeckCardProps {
  readonly reference: string;
  readonly text: string;
  readonly note?: string;
  readonly prayCount: number;
  readonly onSwiped: (direction: SwipeDirection) => void;
  readonly onAnswer: () => void;
}

/**
 * One draggable card. The drag distance is a motion value so the tilt follows it on the
 * compositor; on a committed drag the card animates off-screen, then hands the direction back to
 * the parent (which reveals the next card). Reduced Motion removes the tilt and settles instantly.
 */
function DeckCard({ reference, text, note, prayCount, onSwiped, onAnswer }: DeckCardProps) {
  const reduceMotion = useReducedMotion() === true;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-CARD_EXIT, 0, CARD_EXIT], [-MAX_TILT_DEG, 0, MAX_TILT_DEG]);

  const commit = useCallback(
    (direction: SwipeDirection) => {
      const target = direction === 'prayed' ? CARD_EXIT : -CARD_EXIT;
      void animate(x, target, { duration: reduceMotion ? 0 : 0.22 }).then(() => onSwiped(direction));
    },
    [x, reduceMotion, onSwiped],
  );

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      style={{ x, rotate: reduceMotion ? 0 : rotate }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) commit('prayed');
        else if (info.offset.x < -SWIPE_THRESHOLD) commit('skipped');
      }}
      className={`${CARD} cursor-grab active:cursor-grabbing`}
    >
      <span className="font-ui text-uiMd text-ink-primary">{reference}</span>
      <p className="font-scripture text-ink-primary" style={{ lineHeight: 1.72 }}>
        {text}
      </p>
      {note !== undefined && note !== '' && (
        <p className="font-ui text-uiSm text-ink-secondary">{note}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="font-ui text-uiXs text-ink-secondary">{`${prayCount}× prayed`}</span>
        <button type="button" onClick={onAnswer} className={OUTLINE}>
          Answered
        </button>
      </div>
      <div className="flex justify-between">
        <span className="font-ui text-uiXs text-ink-verse">‹ Skip</span>
        <span className="font-ui text-uiXs text-ink-verse">Prayed ›</span>
      </div>
    </motion.div>
  );
}
