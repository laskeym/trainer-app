import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import {
  getWorkoutSessionDetails,
  ensureSessionExercises,
  getSessionExercises,
  updateWorkoutSessionStatus,
  WorkoutSessionStatus,
} from '../../lib/queries/sessions';
import { getSetLogSummariesForSession } from '../../lib/queries/setLogs';

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

function formatTarget(item: SessionExercise) {
  const sets = item.target_sets;
  const reps = item.target_reps;

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
function formatProgress(item: SessionExercise, progress: ExerciseProgress | undefined) {
  if (!progress || !progress.hasAnyActivity) return formatTarget(item);

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
  // Maps exercise_id -> session_exercise.id once the SessionExercise
  // snapshot is materialized, so tapping an exercise card knows which real
  // row to send the trainer to log sets against (see ensureSessionExercises).
  const [sessionExerciseMap, setSessionExerciseMap] = useState<Record<string, string>>({});
  // Maps exercise_id -> what's actually been logged this session, so the
  // exercise list can show real progress instead of the static template
  // target once logging has started (see formatProgress).
  const [progressMap, setProgressMap] = useState<Record<string, ExerciseProgress>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);

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
      setDetails(data as SessionDetails);

      // Materialize (once) the real SessionExercise rows this session needs
      // for set logging / live editing, then map exercise_id -> its row id
      // so exercise cards below know where to navigate on tap. A failure
      // here shouldn't block viewing the plan — it just means tapping an
      // exercise won't navigate yet, which is handled gracefully below.
      const templateId = (data as SessionDetails).day_type_template?.id ?? null;
      await ensureSessionExercises(id, templateId);
      const { data: sessionExercises } = await getSessionExercises(id);
      const map: Record<string, string> = {};
      (sessionExercises ?? []).forEach((se: any) => {
        if (se.exercise?.id) map[se.exercise.id] = se.id;
      });
      setSessionExerciseMap(map);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Session</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
          {hasTemplate ? (
            <Text style={styles.exerciseCount}>
              {details.exercises.length} {details.exercises.length === 1 ? 'exercise' : 'exercises'}
            </Text>
          ) : null}
        </View>

        {!hasTemplate ? (
          <View style={styles.emptyPlan}>
            <Ionicons name="fitness-outline" size={36} color="#8E8E93" />
            <Text style={styles.emptyPlanTitle}>No workout template assigned</Text>
            <Text style={styles.emptyPlanMessage}>
              This session was scheduled without a workout template.
            </Text>
          </View>
        ) : details.exercises.length === 0 ? (
          <View style={styles.emptyPlan}>
            <Ionicons name="list-outline" size={36} color="#8E8E93" />
            <Text style={styles.emptyPlanTitle}>This template has no exercises</Text>
            <Text style={styles.emptyPlanMessage}>
              Add exercises to the template before running this workout.
            </Text>
          </View>
        ) : (
          <View style={styles.exerciseList}>
            {details.exercises.map((item, index) => {
              const sessionExerciseId = item.exercise?.id ? sessionExerciseMap[item.exercise.id] : undefined;
              const progress = item.exercise?.id ? progressMap[item.exercise.id] : undefined;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.exerciseCard}
                  activeOpacity={0.7}
                  disabled={!sessionExerciseId}
                  testID={`exercise-card-${item.id}`}
                  onPress={() => {
                    if (!sessionExerciseId) return;
                    router.push({
                      pathname: `/session/${details.id}/exercise/${sessionExerciseId}`,
                      params: {
                        exerciseName: item.exercise?.name ?? 'Exercise',
                        targetSets: item.target_sets != null ? String(item.target_sets) : '',
                        targetReps: item.target_reps != null ? String(item.target_reps) : '',
                        clientId: details.client?.id ?? '',
                        exerciseId: item.exercise?.id ?? '',
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
                    <Text style={styles.exerciseName}>{item.exercise?.name ?? 'Exercise'}</Text>
                    {item.exercise?.muscle_group ? (
                      <Text style={styles.exerciseMeta}>{item.exercise.muscle_group}</Text>
                    ) : null}
                    <Text style={styles.exerciseTarget}>
                      {formatProgress(item, progress)}
                    </Text>
                    {progress?.allCompleted && (
                      <View style={styles.exerciseCompletePill} testID={`exercise-complete-${item.id}`}>
                        <Ionicons name="checkmark-circle" size={12} color="#1D7A34" />
                        <Text style={styles.exerciseCompletePillText}>Exercise Complete</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

      </ScrollView>
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
  exerciseList: { gap: 12 },
  exerciseCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
