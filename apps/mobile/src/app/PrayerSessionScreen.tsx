// FR-203 — Prayer Rotation Deck (mobile).
//
// A 5-minute guided session over the active pool's rotation queue. The top card is
// swipe-animated on the UI thread (Reanimated) and, once a swipe passes the threshold, its
// `pray_count` is recorded and the next card is revealed; prayed cards therefore fall to the back
// of the next queue because the repository orders by `last_prayed_at`. Answered cards let the user
// capture a testimony. A Reduced Motion fallback (AGENTS.md rule 6) removes the card rotation and
// settles instantly. All reads/writes go through the headless prayer store (AGENTS.md rule 1) —
// no repository is constructed and no SQL is written here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import type { PrayerPoolView } from '@breath-and-word/core';
import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  MIN_TOUCH_TARGET,
  MOTION_SPRINGS,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const THEME = COLORS.daylight;

/** FR-203 — the deck session length (5 minutes). */
const SESSION_SECONDS = 5 * 60;
/** Horizontal drag distance that commits a swipe. */
const SWIPE_THRESHOLD = 110;
/** Distance the card travels off-screen once a swipe commits. */
const CARD_EXIT = 640;
/** Max card tilt (degrees) at full drag. */
const MAX_TILT_DEG = 12;

type SwipeDirection = 'prayed' | 'skipped';

export function PrayerSessionScreen() {
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
    const timer = setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
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
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Prayer Session</Text>
        {poolId !== null && (
          <Text accessibilityLiveRegion="polite" style={styles.clock}>
            {`${clock} · ${index} prayed`}
          </Text>
        )}
      </View>

      {poolId === null && (
        <View style={styles.pickerWrap}>
          <Text style={styles.muted}>Choose a pool to begin a 5-minute rotation.</Text>
          {pools.length === 0 && (
            <Text style={styles.muted}>Create a pool and capture a passage first.</Text>
          )}
          {pools.map((pool) => (
            <PoolButton key={pool.id} pool={pool} onPress={() => startSession(pool.id)} />
          ))}
        </View>
      )}

      {poolId !== null && rotationStatus === 'loading' && <Text style={styles.muted}>Shuffling…</Text>}

      {poolId !== null && !finished && current !== undefined && (
        <View style={styles.deckWrap}>
          <DeckCard
            key={current.itemId}
            reference={current.passageReference}
            text={current.capturedText}
            note={current.userNotes}
            prayCount={current.prayCount}
            onSwiped={advance}
            onAnswer={() => setAnsweringId(current.itemId)}
          />
        </View>
      )}

      {finished && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Session complete</Text>
          <Text style={styles.muted}>
            {`You prayed through ${Math.min(index, rotationQueue.length)} ${
              Math.min(index, rotationQueue.length) === 1 ? 'passage' : 'passages'
            }. There is nothing to catch up on — return whenever you are ready.`}
          </Text>
          <Pressable
            onPress={() => {
              setPoolId(null);
              setIndex(0);
              setSecondsLeft(SESSION_SECONDS);
            }}
            accessibilityRole="button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      )}

      {poolId !== null && !finished && (
        <Pressable
          onPress={() => setRunning((value) => !value)}
          accessibilityRole="button"
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>{running ? 'Pause' : 'Resume'}</Text>
        </Pressable>
      )}

      <Modal
        visible={answeringId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAnsweringId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Mark answered</Text>
            <Text style={styles.muted}>
              Add a testimony to remember how God answered. It is stored encrypted in your private
              vault.
            </Text>
            <TextInput
              value={testimony}
              onChangeText={setTestimony}
              multiline
              placeholder="What happened?"
              placeholderTextColor={THEME.text.verseNum}
              style={styles.noteInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setAnsweringId(null)}
                accessibilityRole="button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitTestimony()}
                accessibilityRole="button"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PoolButton({ pool, onPress }: { pool: PrayerPoolView; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.poolButton}>
      <Text style={styles.poolButtonTitle}>{pool.title}</Text>
      <Text style={styles.muted}>{`${pool.activeItemsCount} to pray`}</Text>
    </Pressable>
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
 * One swipeable card. Each card owns its shared values so it mounts fresh and settles at rest;
 * on a committed swipe it animates off-screen, then hands the direction back to the parent on the
 * JS thread (which reveals the next card).
 */
function DeckCard({ reference, text, note, prayCount, onSwiped, onAnswer }: DeckCardProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion() === true;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((event) => {
          'worklet';
          translateX.value = event.translationX;
          translateY.value = event.translationY;
        })
        .onEnd((event) => {
          'worklet';
          const committed: SwipeDirection | null =
            event.translationX > SWIPE_THRESHOLD
              ? 'prayed'
              : event.translationX < -SWIPE_THRESHOLD
                ? 'skipped'
                : null;
          if (committed === null) {
            translateX.value = withSpring(0, MOTION_SPRINGS.gentle);
            translateY.value = withSpring(0, MOTION_SPRINGS.gentle);
            return;
          }
          const target = committed === 'prayed' ? CARD_EXIT : -CARD_EXIT;
          translateX.value = withTiming(
            target,
            { duration: reduceMotion ? 0 : 220 },
            (finished) => {
              if (finished) runOnJS(onSwiped)(committed);
            },
          );
        }),
    [reduceMotion, onSwiped, translateX, translateY],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: reduceMotion
          ? '0deg'
          : `${interpolate(
              translateX.value,
              [-width, 0, width],
              [-MAX_TILT_DEG, 0, MAX_TILT_DEG],
              Extrapolation.CLAMP,
            )}deg`,
      },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text style={styles.cardReference}>{reference}</Text>
        <Text style={styles.cardText} numberOfLines={6}>
          {text}
        </Text>
        {note !== undefined && note !== '' && <Text style={styles.cardNote}>{note}</Text>}
        <View style={styles.cardFooter}>
          <Text style={styles.muted}>{`${prayCount}× prayed`}</Text>
          <Pressable
            onPress={onAnswer}
            accessibilityRole="button"
            accessibilityLabel="Mark answered"
            style={styles.answerButton}
          >
            <Text style={styles.answerButtonText}>Answered</Text>
          </Pressable>
        </View>
        <View style={styles.hintRow}>
          <Text style={styles.hint}>‹ Skip</Text>
          <Text style={styles.hint}>Prayed ›</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: THEME.bg.canvas,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  clock: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  pickerWrap: { gap: SPACING.sm },
  deckWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    maxWidth: 460,
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  cardReference: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  cardText: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.scriptureDefault,
    lineHeight: FONT_SIZES.scriptureDefault * LINE_HEIGHTS.scripture,
    color: THEME.text.primary,
  },
  cardNote: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.secondary,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.verseNum,
  },
  answerButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  answerButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  summary: { gap: SPACING.lg, alignItems: 'flex-start' },
  summaryTitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  poolButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    gap: SPACING.xxs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  poolButtonTitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  muted: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.bg.elevated,
  },
  modalSheet: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: THEME.bg.surface,
  },
  modalTitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  noteInput: {
    minHeight: 96,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
    textAlignVertical: 'top',
  },
});
