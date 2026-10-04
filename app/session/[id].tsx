import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import DragList, { DragListRenderItemInfo } from 'react-native-draglist';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  getWorkoutSessionDetails,
  ensureSessionExercises,
  getSessionExercises,
  addSessionExercise,
  removeSessionExercise,
  reorderSessionExercises,
  updateWorkoutSessionStatus,
  deleteWorkoutSession,
  WorkoutSessionStatus,
} from '../../lib/queries/sessions';
import { getSetLogSummariesForSession } from '../../lib/queries/setLogs';
import { getExercisesForTrainer, createExercise } from '../../lib/queries/exercises';
import { getSuggestedMuscleGroups } from '../../lib/dayTypeSuggestions';

// The template-sourced plan preview (from getWorkoutSessionDetails) — used
// only to look up each exercise's original target_sets/target_reps, since
// those columns only ever exist on TemplateExercise, never on
// SessionExercise. The live, editable exercise list the trainer actually
// sees and reorders is LiveSessionExercise below.
type SessionExercise = {
  id: string;
  order: number;
  target_sets: number | null;
  target_reps: number | null;
  exercise: {
    id: string;
    name: string;
    muscle_group: string | null;
    equipment: string | null;
  } | null;
};

// This session's real, independently-editable exercise rows (from
// getSessionExercises) — what SCRUM-31 adds/removes/reorders, distinct
// from the template's static plan.
type LiveSessionExercise = {
  id: string;
  order: number;
  exercise: {
    id: string;
    name: string;
    muscle_group: string | null;
    equipment: string | null;
  } | null;
};

type SessionDetails = {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  location: string | null;
  client: { id: string; name: string } | null;
  day_type_template: { id: string; name: string } | null;
  exercises: SessionExercise[];
};

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(start: string, end: string) {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };

  return `${new Date(start).toLocaleTimeString('en-US', options)} – ${new Date(end).toLocaleTimeString('en-US', options)}`;
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

type TemplateTarget = { target_sets: number | null; target_reps: number | null };

// Target info (target_sets/target_reps) only ever exists on a
// TemplateExercise row, by schema design — never on a SessionExercise row.
// An exercise the trainer added ad-hoc to this specific session has no
// such row at all, so it simply has no target to show, the same as a
// template exercise whose target fields were left blank.
function formatTarget(target: TemplateTarget | undefined) {
  if (!target) return 'No target assigned';
  const { target_sets: sets, target_reps: reps } = target;

  if (sets != null && reps != null) return `${sets} sets × ${reps} reps`;
  if (sets != null) return `${sets} sets`;
  if (reps != null) return `${reps} reps`;
  return 'No target assigned';
}

type ExerciseProgress = {
  completedCount: number;
  totalCount: number;
  hasAnyActivity: boolean;
  allCompleted: boolean;
  summaryText: string | null;
};

/**
 * Once the trainer has recorded any activity on this exercise this
 * session, show what's really happened instead of the template's static
 * target — a target that never changes no matter what the trainer records
 * is misleading once real numbers exist. Falls back to formatTarget only
 * when nothing at all has happened yet (a session's sets exist as blank
 * rows from the moment its exercise screen is first opened, so a plain row
 * count alone isn't enough to tell "nothing logged" from "in progress").
 *
 * X is how many sets the trainer has actually confirmed complete (tapped
 * the checkmark on) — not how many rows merely have a value typed in.
 * Autosave persists in-progress typing the moment a field loses focus (see
 * the set-logging screen), so "has a value" would count sets the trainer
 * never actually confirmed, which doesn't match what "complete" means
 * anywhere else in the app.
 *
 * The denominator is the exercise's live SetLog row count for THIS
 * session, not the template's target_sets — a trainer can add or remove
 * sets per session independently of the template now, so that's the more
 * accurate "out of how many" figure.
 */
function formatProgress(target: TemplateTarget | undefined, progress: ExerciseProgress | undefined) {
  if (!progress || !progress.hasAnyActivity) return formatTarget(target);

  const base = `${progress.completedCount}/${progress.totalCount} sets logged`;
  return progress.summaryText ? `${base} \u00b7 ${progress.summaryText}` : base;
}

const STATUS_STYLES: Record<string, { background: string; text: string }> = {
  planned: { background: '#E5E5EA', text: '#3A3A3C' },
  in_progress: { background: '#FFE8CC', text: '#B25E00' },
  completed: { background: '#D8F5DE', text: '#1D7A34' },
};

export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // This session's real, independently-editable exercise list (from
  // getSessionExercises) — authoritative for rendering, reordering, and
  // navigating into the set-logging screen. Replaces the old
  // exercise_id -> session_exercise.id map now that the live rows
  // themselves (with their real ids) are what gets rendered.
  const [sessionExercises, setSessionExercises] = useState<LiveSessionExercise[]>([]);
  // Maps exercise_id -> the target_sets/target_reps that exercise had on
  // the template, purely for display — an exercise added ad-hoc to this
  // session specifically (not from the template) simply has no entry here.
  const [targetLookup, setTargetLookup] = useState<Record<string, TemplateTarget>>({});
  // Maps exercise_id -> what's actually been logged this session, so the
  // exercise list can show real progress instead of the static template
  // target once logging has started (see formatProgress).
  const [progressMap, setProgressMap] = useState<Record<string, ExerciseProgress>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Exercise picker state — mirrors app/templates/[id]/index.tsx's picker
  // (same library search + "Suggested for <name>" grouping + inline
  // custom-exercise creation), applied to this session's live plan instead
  // of a template's. Kept as a separate, near-duplicate implementation
  // rather than extracting a shared component, to avoid touching the
  // already-tested template editor while building this.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customExercise, setCustomExercise] = useState({ name: '', muscleGroup: '', equipment: '' });
  const [creatingCustom, setCreatingCustom] = useState(false);

  // Gates reorder/delete/add on the Workout Plan behind an explicit "Edit"
  // toggle — those affordances sitting visible by default made it too easy
  // to brush the trash icon or drag handle while just scrolling/tapping
  // into exercises to log sets. Off by default; purely local UI state, not
  // persisted or reset by loadSession.
  const [planEditMode, setPlanEditMode] = useState(false);

  const loadSession = useCallback(async () => {
    if (!session || !id) {
      setLoading(false);
      setError('Session details could not be loaded.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await getWorkoutSessionDetails(
      session.user.id,
      id
    );

    if (queryError) {
      setError(queryError.message);
      setDetails(null);
    } else {
      const sessionData = data as unknown as SessionDetails;
      setDetails(sessionData);

      // The template-sourced plan preview still tells us each exercise's
      // original target_sets/target_reps (those columns never exist on
      // SessionExercise itself) — keep that as a lookup for display, even
      // though the template-sourced list is no longer what gets rendered.
      const targets: Record<string, TemplateTarget> = {};
      sessionData.exercises.forEach((ex) => {
        if (ex.exercise?.id) {
          targets[ex.exercise.id] = { target_sets: ex.target_sets, target_reps: ex.target_reps };
        }
      });
      setTargetLookup(targets);

      // Materialize (once) the real SessionExercise rows this session needs
      // for set logging / live editing, then load them as the authoritative,
      // independently-editable plan this screen now renders, reorders, and
      // adds/removes exercises from. A failure here shouldn't block viewing
      // the rest of the session — it just means the plan list stays empty.
      const templateId = sessionData.day_type_template?.id ?? null;
      await ensureSessionExercises(id, templateId);
      const { data: liveExercises } = await getSessionExercises(id);
      setSessionExercises((liveExercises ?? []) as unknown as LiveSessionExercise[]);

      const { data: summaries } = await getSetLogSummariesForSession(id);
      const progress: Record<string, ExerciseProgress> = {};
      (summaries ?? []).forEach((se: any) => {
        const logs = (se.set_log ?? []).slice().sort((a: any, b: any) => a.set_number - b.set_number);
        if (logs.length === 0) return;

        // "Any activity" (the fallback trigger) is broader than "completed"
        // — a row with a typed-but-unconfirmed value still counts as
        // activity worth showing, even though it doesn't count toward X.
        const filledLogs = logs.filter((log: any) => log.weight != null || log.reps != null);
        const completedLogs = logs.filter((log: any) => log.completed);
        if (filledLogs.length === 0 && completedLogs.length === 0) return;

        // Only confirmed sets appear in the detail text — showing an
        // unconfirmed value next to a count that only counts confirmed
        // sets would be its own source of confusion.
        const summaryText = completedLogs
          .map((log: any) => {
            if (log.weight != null && log.reps != null) return `${log.weight}x${log.reps}`;
            if (log.weight != null) return `${log.weight} lbs`;
            if (log.reps != null) return `${log.reps} reps`;
            return null;
          })
          .filter(Boolean)
          .join(', ');

        progress[se.exercise_id] = {
          completedCount: completedLogs.length,
          totalCount: logs.length,
          hasAnyActivity: true,
          allCompleted: logs.every((log: any) => log.completed),
          summaryText: summaryText || null,
        };
      });
      setProgressMap(progress);
    }

    setLoading(false);
  }, [id, session]);

  // useFocusEffect (not a plain useEffect) so this refetches every time the
  // screen regains focus — including when returning from the set-logging
  // screen via router.back(). Stack screens stay mounted when another
  // screen is pushed on top, so a plain mount-effect would keep showing
  // stale progress/status after logging sets. Same fix already applied to
  // the dashboard for the same reason.
  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [loadSession])
  );

  const handleExercisesReordered = async (fromIndex: number, toIndex: number) => {
    const reordered = [...sessionExercises];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Update locally right away so the reorder feels instant, then persist.
    setSessionExercises(reordered);

    try {
      const { error } = await reorderSessionExercises(reordered.map((ex) => ({ id: ex.id })));
      if (error) throw error;
    } catch (err: any) {
      console.error('❌ Failed to persist exercise order:', err.message);
      Alert.alert('Reorder Failed', err.message || 'An unexpected server issue occurred.');
      loadSession(); // fall back to the server's actual order
    }
  };

  const handleRemoveExercise = (sessionExerciseId: string) => {
    Alert.alert(
      'Remove Exercise',
      'Remove this exercise from today\u2019s workout plan? Any sets already logged for it will be deleted too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await removeSessionExercise(sessionExerciseId);
              if (error) throw error;
              setSessionExercises((prev) => prev.filter((ex) => ex.id !== sessionExerciseId));
            } catch (err: any) {
              console.error('❌ Failed to remove exercise:', err.message);
              Alert.alert('Remove Failed', err.message || 'An unexpected server issue occurred.');
            }
          },
        },
      ]
    );
  };

  const openPicker = async () => {
    setPickerVisible(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await getExercisesForTrainer(user.id);
      if (error) throw error;
      setLibrary(data ?? []);
    } catch (err: any) {
      console.error('❌ Failed to load exercise library:', err.message);
      Alert.alert('Couldn\u2019t Load Exercises', err.message || 'An unexpected server issue occurred.');
    }
  };

  const filteredLibrary = library.filter((ex) =>
    ex.name?.toLowerCase().includes(librarySearch.toLowerCase())
  );

  // Same "Suggested for <name>" grouping as the template editor's picker,
  // keyed off the assigned template's name if there is one. A session with
  // no template just gets a flat, ungrouped list — same fallback the
  // template editor uses for a template name matching no known keyword.
  type PickerRow =
    | { type: 'header'; key: string; label: string }
    | { type: 'exercise'; key: string; exercise: any };

  const pickerRows: PickerRow[] = (() => {
    const templateName = details?.day_type_template?.name;
    const suggestedGroups = templateName ? getSuggestedMuscleGroups(templateName) : [];
    if (suggestedGroups.length === 0) {
      return filteredLibrary.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex }));
    }

    const suggested = filteredLibrary.filter(
      (ex) => ex.muscle_group && suggestedGroups.includes(ex.muscle_group)
    );
    const suggestedIds = new Set(suggested.map((ex) => ex.id));
    const others = filteredLibrary.filter((ex) => !suggestedIds.has(ex.id));

    if (suggested.length === 0) {
      return others.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex }));
    }

    const rows: PickerRow[] = [
      { type: 'header', key: 'header-suggested', label: `Suggested for ${templateName}` },
      ...suggested.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex })),
    ];
    if (others.length > 0) {
      rows.push({ type: 'header', key: 'header-all', label: 'All Exercises' });
      rows.push(...others.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex })));
    }
    return rows;
  })();

  const handleAddExercise = async (exerciseId: string) => {
    if (!details) return;
    setAddingExerciseId(exerciseId);
    try {
      const nextOrder = sessionExercises.length;
      const { data, error } = await addSessionExercise({
        sessionId: details.id,
        exerciseId,
        order: nextOrder,
        dayTypeTemplateId: details.day_type_template?.id ?? null,
      });
      if (error) throw error;

      setSessionExercises((prev) => [...prev, data as unknown as LiveSessionExercise]);
      setPickerVisible(false);
      setLibrarySearch('');
    } catch (err: any) {
      console.error('❌ Failed to add exercise to session:', err.message);
      Alert.alert('Add Failed', err.message || 'An unexpected server issue occurred.');
    } finally {
      setAddingExerciseId(null);
    }
  };

  const handleCreateCustomExercise = async () => {
    if (!customExercise.name.trim()) {
      Alert.alert('Required Field', 'Please enter a name for the exercise.');
      return;
    }

    setCreatingCustom(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authenticated trainer session not found.');

      const { data, error } = await createExercise({
        trainerId: user.id,
        name: customExercise.name.trim(),
        muscleGroup: customExercise.muscleGroup.trim() || null,
        equipment: customExercise.equipment.trim() || null,
      });
      if (error) throw error;

      setLibrary((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomExercise({ name: '', muscleGroup: '', equipment: '' });
      setShowCustomForm(false);

      // Go straight from "created" to "added to this session" — a custom
      // exercise the trainer just typed in has nowhere else useful to sit.
      await handleAddExercise(data.id);
    } catch (err: any) {
      console.error('❌ Failed to create custom exercise:', err.message);
      Alert.alert('Creation Failed', err.message || 'An unexpected server issue occurred.');
    } finally {
      setCreatingCustom(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Session</Text>
          <View style={styles.navSpacer} />
        </View>
        <ActivityIndicator style={styles.loader} size="large" />
      </SafeAreaView>
    );
  }

  if (error || !details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Session</Text>
          <View style={styles.navSpacer} />
        </View>
        <View style={styles.stateContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#8E8E93" />
          <Text style={styles.stateTitle}>Couldn't load session</Text>
          <Text style={styles.stateMessage}>{error ?? 'This session may no longer exist.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSession}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasTemplate = !!details.day_type_template;

  const handleStatusChange = async (nextStatus: WorkoutSessionStatus) => {
    setStatusUpdating(true);
    try {
      const { data, error } = await updateWorkoutSessionStatus(details.id, nextStatus);
      if (error || !data) throw error ?? new Error('No response from server.');
      setDetails((prev) => (prev ? { ...prev, status: data.status } : prev));
    } catch (err: any) {
      console.error('❌ Failed to update session status:', err.message);
      Alert.alert('Update Failed', err.message || 'An unexpected server issue occurred.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const statusStyle = STATUS_STYLES[details.status] ?? STATUS_STYLES.planned;

  const handleDelete = () => {
    Alert.alert(
      'Delete Session',
      `Delete this session with ${details.client?.name ?? 'this client'}? Any logged sets will be permanently lost. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await deleteWorkoutSession(details.id);
              if (error) throw error;
              router.back();
            } catch (err: any) {
              console.error('❌ Failed to delete session:', err.message);
              Alert.alert('Delete Failed', err.message || 'An unexpected server issue occurred.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Session</Text>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/session/new', params: { editSessionId: details.id } })}
            style={styles.navIconButton}
            disabled={deleting}
            testID="edit-session-button"
          >
            <Ionicons name="pencil-outline" size={20} color="#1C1C1E" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.navIconButton}
            disabled={deleting}
            testID="delete-session-button"
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      {/* DragList is FlatList-based, so everything that used to sit around
          the exercise list inside a plain ScrollView now lives in
          ListHeaderComponent/ListFooterComponent instead — nesting a
          FlatList inside a ScrollView breaks virtualization and triggers
          React Native's own warning against it. Same restructuring already
          applied to the template editor screen. */}
      <DragList
        data={sessionExercises}
        keyExtractor={(ex: LiveSessionExercise) => ex.id}
        onReordered={handleExercisesReordered}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Text style={styles.clientName}>{details.client?.name ?? 'Client'}</Text>
              <Text style={styles.templateName}>
                {details.day_type_template?.name ?? 'Workout Session'}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>{formatStatus(details.status)}</Text>
              </View>

              <View style={styles.statusActions}>
                {details.status === 'planned' && (
                  <TouchableOpacity
                    style={styles.primaryStatusButton}
                    onPress={() => handleStatusChange('in_progress')}
                    disabled={statusUpdating}
                    testID="start-workout-button"
                  >
                    <Text style={styles.primaryStatusButtonText}>Start Workout</Text>
                  </TouchableOpacity>
                )}
                {details.status === 'in_progress' && (
                  <TouchableOpacity
                    style={styles.primaryStatusButton}
                    onPress={() => handleStatusChange('completed')}
                    disabled={statusUpdating}
                    testID="mark-complete-button"
                  >
                    <Text style={styles.primaryStatusButtonText}>Mark Complete</Text>
                  </TouchableOpacity>
                )}
                {details.status === 'completed' && (
                  <TouchableOpacity
                    style={styles.secondaryStatusButton}
                    onPress={() => handleStatusChange('in_progress')}
                    disabled={statusUpdating}
                    testID="reopen-session-button"
                  >
                    <Text style={styles.secondaryStatusButtonText}>Reopen Session</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={20} color="#636366" />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailLabel}>DATE</Text>
                  <Text style={styles.detailValue}>{formatSessionDate(details.scheduled_start)}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color="#636366" />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailLabel}>TIME</Text>
                  <Text style={styles.detailValue}>
                    {formatTimeRange(details.scheduled_start, details.scheduled_end)}
                  </Text>
                </View>
              </View>

              {details.location ? (
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={20} color="#636366" />
                  <View style={styles.detailTextWrap}>
                    <Text style={styles.detailLabel}>LOCATION</Text>
                    <Text style={styles.detailValue}>{details.location}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>WORKOUT PLAN</Text>
              <View style={styles.sectionHeaderRight}>
                <Text style={styles.exerciseCount}>
                  {sessionExercises.length} {sessionExercises.length === 1 ? 'exercise' : 'exercises'}
                </Text>
                <TouchableOpacity
                  onPress={() => setPlanEditMode((prev) => !prev)}
                  style={styles.planEditToggle}
                  testID="plan-edit-toggle"
                >
                  <Text style={styles.planEditToggleText}>{planEditMode ? 'Done' : 'Edit'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Exercises can now be added to a session regardless of
                whether it has a template — this is just context, not a
                blocker, so it's a small note rather than the whole-section
                empty state it used to be. */}
            {!hasTemplate && (
              <Text style={styles.noTemplateNote}>
                No workout template assigned — exercises below were built for this session only.
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyPlan}>
            <Ionicons name="fitness-outline" size={36} color="#8E8E93" />
            <Text style={styles.emptyPlanTitle}>No exercises yet</Text>
            <Text style={styles.emptyPlanMessage}>
              {planEditMode
                ? "Add an exercise below to build today's workout plan."
                : 'Tap Edit above to add exercises to this plan.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          planEditMode ? (
            <TouchableOpacity style={styles.addExerciseButton} onPress={openPicker}>
              <Ionicons name="add-circle" size={18} color="#1C1C1E" />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item: ex, index, onDragStart, onDragEnd, isActive }: DragListRenderItemInfo<LiveSessionExercise>) => {
          const target = ex.exercise?.id ? targetLookup[ex.exercise.id] : undefined;
          const progress = ex.exercise?.id ? progressMap[ex.exercise.id] : undefined;
          return (
            <View
              style={[styles.exerciseCard, isActive && styles.exerciseCardActive]}
              testID={`exercise-card-${ex.id}`}
            >
              <TouchableOpacity
                style={styles.exerciseCardBody}
                activeOpacity={0.7}
                testID={`exercise-card-body-${ex.id}`}
                onPress={() => {
                  // expo-router's typed routes can match a single dynamic
                  // segment interpolated into a template string (e.g.
                  // `/session/${id}`), but not a two-level nested dynamic
                  // path like this one — the bracket-pattern + params form
                  // is what the route's own [id]/exercise/[sessionExerciseId]
                  // file structure expects, and is what TypeScript can
                  // actually check against.
                  router.push({
                    pathname: '/session/[id]/exercise/[sessionExerciseId]',
                    params: {
                      id: details.id,
                      sessionExerciseId: ex.id,
                      exerciseName: ex.exercise?.name ?? 'Exercise',
                      targetSets: target?.target_sets != null ? String(target.target_sets) : '',
                      targetReps: target?.target_reps != null ? String(target.target_reps) : '',
                      clientId: details.client?.id ?? '',
                      exerciseId: ex.exercise?.id ?? '',
                      sessionStatus: details.status,
                    },
                  });
                }}
              >
                <View style={[styles.exerciseNumber, progress?.allCompleted && styles.exerciseNumberComplete]}>
                  {progress?.allCompleted ? (
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  ) : (
                    <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                  )}
                </View>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{ex.exercise?.name ?? 'Exercise'}</Text>
                  {ex.exercise?.muscle_group ? (
                    <Text style={styles.exerciseMeta}>{ex.exercise.muscle_group}</Text>
                  ) : null}
                  <Text style={styles.exerciseTarget}>
                    {formatProgress(target, progress)}
                  </Text>
                  {progress?.allCompleted && (
                    <View style={styles.exerciseCompletePill} testID={`exercise-complete-${ex.id}`}>
                      <Ionicons name="checkmark-circle" size={12} color="#1D7A34" />
                      <Text style={styles.exerciseCompletePillText}>Exercise Complete</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {planEditMode ? (
                <>
                  {/* Press and hold to pick the row up — keeps drag
                      activation away from the tap-to-navigate body and the
                      remove button. onPressOut must fire onDragEnd even on
                      a plain tap (no movement), or DragList never learns
                      the gesture ended. */}
                  <TouchableOpacity
                    onPressIn={onDragStart}
                    onPressOut={onDragEnd}
                    style={styles.dragHandle}
                    testID={`drag-handle-${ex.id}`}
                  >
                    <Ionicons name="reorder-three-outline" size={22} color="#8E8E93" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeExerciseButton}
                    onPress={() => handleRemoveExercise(ex.id)}
                    testID={`remove-exercise-${ex.id}`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#C7C7CC" style={styles.exerciseChevron} />
              )}
            </View>
          );
        }}
      />

      {/* Exercise picker modal — same library search + "Suggested for
          <name>" grouping + inline custom-exercise creation as the
          template editor's picker, applied to this session's live plan. */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Exercise</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Search exercises..."
              placeholderTextColor="#C7C7CC"
              style={styles.searchInput}
              value={librarySearch}
              onChangeText={setLibrarySearch}
            />

            <FlatList
              data={pickerRows}
              keyExtractor={(row) => row.key}
              style={styles.pickerList}
              renderItem={({ item: row }) => {
                if (row.type === 'header') {
                  return <Text style={styles.pickerSectionHeader}>{row.label}</Text>;
                }

                const item = row.exercise;
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => handleAddExercise(item.id)}
                    disabled={addingExerciseId !== null}
                  >
                    <View>
                      <Text style={styles.pickerRowText}>{item.name}</Text>
                      {(item.muscle_group || item.equipment) && (
                        <Text style={styles.pickerRowSubtitle}>
                          {[item.muscle_group, item.equipment].filter(Boolean).join(' \u2022 ')}
                        </Text>
                      )}
                    </View>
                    {addingExerciseId === item.id ? (
                      <ActivityIndicator size="small" color="#1C1C1E" />
                    ) : (
                      <Ionicons name="add" size={20} color="#1C1C1E" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyListText}>No exercises found.</Text>}
            />

            {showCustomForm ? (
              <View style={styles.customForm}>
                <TextInput
                  placeholder="Exercise name"
                  placeholderTextColor="#C7C7CC"
                  style={styles.customInput}
                  value={customExercise.name}
                  onChangeText={(v) => setCustomExercise((p) => ({ ...p, name: v }))}
                  editable={!creatingCustom}
                />
                <View style={styles.customInputRow}>
                  <TextInput
                    placeholder="Muscle group"
                    placeholderTextColor="#C7C7CC"
                    style={[styles.customInput, styles.customInputHalf]}
                    value={customExercise.muscleGroup}
                    onChangeText={(v) => setCustomExercise((p) => ({ ...p, muscleGroup: v }))}
                    editable={!creatingCustom}
                  />
                  <TextInput
                    placeholder="Equipment"
                    placeholderTextColor="#C7C7CC"
                    style={[styles.customInput, styles.customInputHalf]}
                    value={customExercise.equipment}
                    onChangeText={(v) => setCustomExercise((p) => ({ ...p, equipment: v }))}
                    editable={!creatingCustom}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.customSubmitButton, creatingCustom && styles.disabledButton]}
                  onPress={handleCreateCustomExercise}
                  disabled={creatingCustom}
                  testID="create-custom-exercise-submit"
                >
                  {creatingCustom ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.customSubmitText}>Create & Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.customToggle} onPress={() => setShowCustomForm(true)}>
                <Ionicons name="add-circle-outline" size={16} color="#1C1C1E" />
                <Text style={styles.customToggleText}>Can't find it? Create a custom exercise</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  navBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  navSpacer: { width: 40 },
  navActions: { flexDirection: 'row', gap: 4 },
  navIconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loader: { marginTop: 64 },
  content: { padding: 24, paddingTop: 12, paddingBottom: 40 },
  hero: { marginBottom: 24 },
  clientName: { fontSize: 30, fontWeight: '800', color: '#1C1C1E' },
  templateName: { fontSize: 17, color: '#636366', marginTop: 4 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  statusText: { fontSize: 12, fontWeight: '700', color: '#3A3A3C' },
  statusActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryStatusButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryStatusButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  secondaryStatusButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  secondaryStatusButtonText: { color: '#1C1C1E', fontWeight: '700', fontSize: 14 },
  detailsCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 4,
    marginBottom: 28,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  detailTextWrap: { flex: 1 },
  detailLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#8E8E93' },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: '#8E8E93' },
  exerciseCount: { fontSize: 13, color: '#8E8E93' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planEditToggle: { paddingVertical: 2, paddingHorizontal: 4 },
  planEditToggleText: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  exerciseChevron: { marginLeft: 4 },
  exerciseList: { gap: 12 },
  exerciseCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exerciseCardActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  exerciseCardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dragHandle: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeExerciseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noTemplateNote: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 14,
    height: 52,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  addExerciseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    color: '#1C1C1E',
    fontSize: 15,
    marginBottom: 8,
  },
  pickerList: {
    marginTop: 4,
    maxHeight: 260,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  pickerRowText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  pickerRowSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  pickerSectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
    paddingTop: 12,
    paddingBottom: 6,
  },
  emptyListText: {
    textAlign: 'center',
    color: '#8E8E93',
    paddingVertical: 24,
  },
  customToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
  },
  customToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  customForm: {
    paddingTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    marginTop: 8,
  },
  customInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    color: '#1C1C1E',
    fontSize: 15,
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customInputHalf: {
    flex: 1,
  },
  customSubmitButton: {
    backgroundColor: '#1C1C1E',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#3A3A3C',
    opacity: 0.7,
  },
  customSubmitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  exerciseNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: { color: '#FFF', fontWeight: '700' },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  exerciseMeta: { fontSize: 13, color: '#8E8E93', marginTop: 2, textTransform: 'capitalize' },
  exerciseTarget: { fontSize: 13, color: '#636366', marginTop: 6 },
  exerciseNumberComplete: { backgroundColor: '#34C759' },
  exerciseCompletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#D8F5DE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  exerciseCompletePillText: { fontSize: 11, fontWeight: '700', color: '#1D7A34' },
  emptyPlan: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  emptyPlanTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptyPlanMessage: { marginTop: 6, fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20 },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  stateTitle: { marginTop: 12, fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  stateMessage: { marginTop: 8, fontSize: 14, color: '#8E8E93', textAlign: 'center' },
  retryButton: { marginTop: 20, backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryButtonText: { color: '#FFF', fontWeight: '700' },
});
