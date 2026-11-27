// FR-202 / FR-203 — Categorized prayer pools screen (mobile).
//
// Renders the user's owned + joined pools and, once a pool is opened, its captured items with the
// per-user actions FR-203 needs (`pray_count+1`, private E2EE note, answered + testimony, archive).
// Pure presentation: every read/write goes through the headless prayer store (AGENTS.md rule 1) —
// no repository is constructed and no SQL is written here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  AppError,
  AsyncStatus,
  PrayerCategory,
  PrayerPoolItemView,
  PrayerPoolView,
  PoolVisibility,
} from '@breath-and-word/core';
import { FONT_FACES, FONT_SIZES, LINE_HEIGHTS, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';
import { makeStyles, useTheme } from '../theme/ThemeProvider';

/** The default (daylight) theme; theme switching lands with the appearance settings. */

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

export function PoolsScreen() {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
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
    if (userId !== null) {
      void runtime.stores.prayer.getState().loadPools(userId);
    }
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

  const shareCodeWithOthers = useCallback(async (title: string, code: string) => {
    try {
      await Share.share({
        message: `Join my prayer pool “${title}” in Breath & Word — code ${code}`,
      });
    } catch {
      // The user dismissed the share sheet; nothing to recover.
    }
  }, []);

  const act = useCallback(
    async (item: PrayerPoolItemView, action: 'pray' | 'archive' | 'answer') => {
      if (userId === null) return;
      const store = runtime.stores.prayer.getState();
      if (action === 'pray') await store.recordPray(userId, item.itemId, item.poolId);
      if (action === 'archive') await store.setArchived(userId, item.itemId, item.poolId, !item.isArchived);
      if (action === 'answer') await store.markAnswered(userId, item.itemId, item.poolId);
    },
    [runtime, userId],
  );

  const saveNote = useCallback(
    async (note: string) => {
      if (userId === null || noteTarget === null) return;
      await runtime.stores.prayer.getState().setNote(userId, noteTarget.itemId, noteTarget.poolId, note);
      setNoteTarget(null);
    },
    [runtime, userId, noteTarget],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{activePool === null ? 'Prayer Pools' : activePool.title}</Text>
          {activePool === null ? (
            <View style={styles.headerActions}>
              {joinAvailable && (
                <Pressable
                  onPress={() => setJoinOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Join a shared prayer pool with a code"
                  style={styles.outlineButton}
                >
                  <Text style={styles.outlineButtonText}>Join with a code</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setCreateOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Create a prayer pool"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>New pool</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={closePool}
              accessibilityRole="button"
              accessibilityLabel="Back to prayer pools"
              style={styles.outlineButton}
            >
              <Text style={styles.outlineButtonText}>Back</Text>
            </Pressable>
          )}
        </View>
      </View>

      {activePool === null ? (
        <ScrollView contentContainerStyle={styles.content}>
          {poolsStatus === 'loading' && <ActivityIndicator color={THEME.accent.primary} />}
          {poolsError !== null && (
            <Text accessibilityRole="alert" style={styles.error}>
              {poolsError.userMessage}
            </Text>
          )}
          {poolsStatus === 'ready' && pools.length === 0 && (
            <Text style={styles.muted}>No pools yet. Create one to begin gathering passages to pray.</Text>
          )}
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} onOpen={openPool} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {activePool.userRole === 'OWNER' && (
            <ShareCodePanel
              code={freshShareCode ?? activePool.shareCode ?? null}
              status={shareCodeStatus}
              error={shareCodeError}
              onGenerate={() => void generateShareCode(activePool.id)}
              onShare={(code) => void shareCodeWithOthers(activePool.title, code)}
            />
          )}
          {itemsStatus === 'loading' && <ActivityIndicator color={THEME.accent.primary} />}
          {itemsError !== null && (
            <Text accessibilityRole="alert" style={styles.error}>
              {itemsError.userMessage}
            </Text>
          )}
          {itemsStatus === 'ready' && items.length === 0 && (
            <Text style={styles.muted}>
              No passages captured yet. Use Capture in the reader to add one.
            </Text>
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
        </ScrollView>
      )}

      <CreatePoolModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createPool}
      />
      <JoinPoolModal
        visible={joinOpen}
        status={joinStatus}
        error={joinError}
        onClose={() => setJoinOpen(false)}
        onJoin={joinPool}
      />
      <NoteModal
        item={noteTarget}
        onClose={() => setNoteTarget(null)}
        onSave={saveNote}
      />
    </View>
  );
}

function PoolCard({ pool, onOpen }: { pool: PrayerPoolView; onOpen: (id: string) => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onOpen(pool.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open pool ${pool.title}`}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{pool.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pool.visibility === 'SHARED' ? 'Shared' : 'Private'}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>
        {`${CATEGORY_LABELS[pool.category]} · ${pool.activeItemsCount} to pray · ${pool.answeredItemsCount} answered`}
      </Text>
      {pool.visibility === 'SHARED' && (
        <Text style={styles.cardMeta}>{`${pool.memberCount} member${pool.memberCount === 1 ? '' : 's'}`}</Text>
      )}
    </Pressable>
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
  const styles = useStyles();
  const answered = item.answeredAt !== undefined;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.passageReference}</Text>
        <Text style={styles.cardMeta}>{`${item.prayCount}× prayed`}</Text>
      </View>
      <Text style={styles.passage} numberOfLines={3}>
        {item.capturedText}
      </Text>
      {item.userNotes !== undefined && item.userNotes.length > 0 && (
        <Text style={styles.note}>{`Note: ${item.userNotes}`}</Text>
      )}
      {answered && <Text style={styles.answered}>{'Answered'}</Text>}
      <View style={styles.actions}>
        <ActionChip label="Pray" onPress={onPray} />
        <ActionChip label={item.userNotes === undefined ? 'Add note' : 'Edit note'} onPress={onEditNote} />
        <ActionChip label={answered ? 'Answered' : 'Mark answered'} onPress={onAnswer} disabled={answered} />
        <ActionChip label={item.isArchived ? 'Unarchive' : 'Archive'} onPress={onArchive} />
      </View>
    </View>
  );
}

function ShareCodePanel({
  code,
  status,
  error,
  onGenerate,
  onShare,
}: {
  code: string | null;
  status: AsyncStatus;
  error: AppError | null;
  onGenerate: () => void;
  onShare: (code: string) => void;
}) {
  const styles = useStyles();
  const busy = status === 'loading';
  return (
    <View style={styles.sharePanel}>
      <Text style={styles.fieldLabel}>Share code</Text>
      {code !== null ? (
        <>
          <Text selectable accessibilityLabel={`Share code ${code}`} style={styles.shareCode}>
            {code}
          </Text>
          <Text style={styles.muted}>
            Anyone with this 8-character code can join and see this pool’s passages.
          </Text>
          <View style={styles.actions}>
            <ActionChip label="Share code" onPress={() => onShare(code)} />
            <ActionChip label={busy ? 'Working…' : 'New code'} onPress={onGenerate} disabled={busy} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.muted}>Create a code so others can join this pool.</Text>
          <Pressable
            onPress={onGenerate}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Create share code"
            style={[styles.primaryButton, busy && styles.actionChipDisabled]}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Creating…' : 'Create share code'}</Text>
          </Pressable>
        </>
      )}
      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error.userMessage}
        </Text>
      )}
    </View>
  );
}

function ActionChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled === true}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.actionChip, disabled === true && styles.actionChipDisabled]}
    >
      <Text style={styles.actionChipText}>{label}</Text>
    </Pressable>
  );
}

function CreatePoolModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; category: PrayerCategory; visibility: PoolVisibility }) => void;
}) {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PrayerCategory>('GUIDANCE');
  const [visibility, setVisibility] = useState<PoolVisibility>('PRIVATE');

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    onCreate({ title: trimmed, category, visibility });
    setTitle('');
    setCategory('GUIDANCE');
    setVisibility('PRIVATE');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New pool</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.outlineButton}>
              <Text style={styles.outlineButtonText}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Pool name"
            placeholderTextColor={THEME.text.verseNum}
            accessibilityLabel="Pool name"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Category</Text>
          <ChipRow
            options={CATEGORIES}
            selected={category}
            labelFor={(value) => CATEGORY_LABELS[value]}
            onSelect={setCategory}
          />
          <Text style={styles.fieldLabel}>Visibility</Text>
          <ChipRow
            options={['PRIVATE', 'SHARED'] as const}
            selected={visibility}
            labelFor={(value) => (value === 'SHARED' ? 'Shared' : 'Private')}
            onSelect={setVisibility}
          />
          <Pressable
            onPress={submit}
            disabled={title.trim().length === 0}
            accessibilityRole="button"
            style={[styles.primaryButton, title.trim().length === 0 && styles.actionChipDisabled]}
          >
            <Text style={styles.primaryButtonText}>Create pool</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function JoinPoolModal({
  visible,
  status,
  error,
  onClose,
  onJoin,
}: {
  visible: boolean;
  status: AsyncStatus;
  error: AppError | null;
  onClose: () => void;
  onJoin: (code: string) => void;
}) {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const [code, setCode] = useState('');

  useEffect(() => {
    // Clear any stale failure copy when the sheet is reopened.
    if (visible) setCode('');
  }, [visible]);

  const submitting = status === 'loading';
  const canSubmit = code.trim().length > 0 && !submitting;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Join a pool</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.outlineButton}>
              <Text style={styles.outlineButtonText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>
            Enter the 8-character code your group leader shared. The pool appears once it syncs.
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="e.g. K9P4M2X7"
            placeholderTextColor={THEME.text.verseNum}
            accessibilityLabel="Pool share code"
            style={styles.input}
          />
          {error !== null && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error.userMessage}
            </Text>
          )}
          <Pressable
            onPress={() => onJoin(code)}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Join pool"
            style={[styles.primaryButton, !canSubmit && styles.actionChipDisabled]}
          >
            <Text style={styles.primaryButtonText}>{submitting ? 'Joining…' : 'Join pool'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function NoteModal({
  item,
  onClose,
  onSave,
}: {
  item: PrayerPoolItemView | null;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(item?.userNotes ?? '');
  }, [item]);

  return (
    <Modal visible={item !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Private note</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.outlineButton}>
              <Text style={styles.outlineButtonText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>
            Stored encrypted in your private vault — never shared with the pool.
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="What are you holding before God?"
            placeholderTextColor={THEME.text.verseNum}
            accessibilityLabel="Private note"
            style={[styles.input, styles.noteInput]}
          />
          <Pressable onPress={() => onSave(note)} accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Save note</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

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
  const styles = useStyles();
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            accessibilityRole="button"
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{labelFor(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((THEME) => ({
  root: { flex: 1, backgroundColor: THEME.bg.canvas },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border.subtle,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  card: {
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    flexShrink: 1,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  cardMeta: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: RADII.pill,
    backgroundColor: THEME.bg.elevated,
  },
  badgeText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  passage: {
    fontFamily: FONT_FACES.scripture.regular,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.scripture,
    color: THEME.text.primary,
  },
  note: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  answered: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.accent.primary,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  actionChip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  actionChipDisabled: { opacity: 0.4 },
  actionChipText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.primary,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  outlineButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  outlineButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  muted: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: THEME.bg.elevated },
  modalSheet: {
    maxHeight: '85%',
    padding: SPACING.xl,
    gap: SPACING.md,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: THEME.bg.surface,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  fieldLabel: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  sharePanel: {
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.accent.primary,
    backgroundColor: THEME.bg.surface,
  },
  shareCode: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    letterSpacing: 3,
    color: THEME.text.primary,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.canvas,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  noteInput: { minHeight: MIN_TOUCH_TARGET * 2, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  chipActive: { backgroundColor: THEME.accent.primary, borderColor: THEME.accent.primary },
  chipText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  chipTextActive: { color: THEME.bg.canvas },
}));
