import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { getWorkoutSessionDetails, ensureSessionExercises, getSessionExercises } from '../../lib/queries/sessions';

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
    }

    setLoading(false);
  }, [id, session]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

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
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{formatStatus(details.status)}</Text>
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
                      },
                    });
                  }}
                >
                  <View style={styles.exerciseNumber}>
                    <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{item.exercise?.name ?? 'Exercise'}</Text>
                    {item.exercise?.muscle_group ? (
                      <Text style={styles.exerciseMeta}>{item.exercise.muscle_group}</Text>
                    ) : null}
                    <Text style={styles.exerciseTarget}>{formatTarget(item)}</Text>
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
  emptyPlan: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  emptyPlanTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptyPlanMessage: { marginTop: 6, fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20 },
  phaseNote: { flexDirection: 'row', gap: 8, marginTop: 28, paddingHorizontal: 4, alignItems: 'flex-start' },
  phaseNoteText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#636366' },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  stateTitle: { marginTop: 12, fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  stateMessage: { marginTop: 8, fontSize: 14, color: '#8E8E93', textAlign: 'center' },
  retryButton: { marginTop: 20, backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryButtonText: { color: '#FFF', fontWeight: '700' },
});
