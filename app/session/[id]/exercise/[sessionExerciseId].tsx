// app/session/[id]/exercise/[sessionExerciseId].tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getSetLogsForSessionExercise,
  ensureSetLogRows,
  createBlankSetLog,
  updateSetLog,
  deleteSetLog,
  getLastLoggedSets,
} from '../../../../lib/queries/setLogs';
import { updateWorkoutSessionStatus } from '../../../../lib/queries/sessions';

type SetRow = {
  id: string;
  setNumber: number;
  weight: string;
  reps: string;
  completed: boolean;
};

const REST_PRESETS_SECONDS = [60, 90, 120];

function formatLastTimeSets(sets: { set_number: number; weight: number | null; reps: number | null }[]) {
  if (sets.length === 0) return null;
  return sets
    .map((s) => {
      if (s.weight != null && s.reps != null) return `${s.weight}x${s.reps}`;
      if (s.weight != null) return `${s.weight} lbs`;
      if (s.reps != null) return `${s.reps} reps`;
      return '—';
    })
    .join(', ');
}

export default function SetLoggingScreen() {
  const router = useRouter();
  const { id, sessionExerciseId, exerciseName, targetSets, targetReps, clientId, exerciseId, sessionStatus } =
    useLocalSearchParams<{
      id: string;
      sessionExerciseId: string;
      exerciseName?: string;
      targetSets?: string;
      targetReps?: string;
      clientId?: string;
      exerciseId?: string;
      sessionStatus?: string;
    }>();

  // Tracks the session's status locally so we only fire the auto-transition
  // (planned -> in_progress) once per screen visit, even if the trainer logs
  // several sets in a row — updateWorkoutSessionStatus is a real write, not
  // something to call on every single set.
  const hasStartedSessionRef = useRef(sessionStatus !== 'planned');

  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [lastTimeText, setLastTimeText] = useState<string | null>(null);

  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Guarantees this exercise has real SetLog rows to work with — one
      // per target set, or at least one if there's no known target — before
      // reading them back. This is what makes a still-blank or in-progress
      // set survive navigating away and returning: every row on screen is a
      // real row from the moment the screen opens, not only once the
      // trainer taps the checkmark.
      const rowCount = targetSets ? parseInt(targetSets, 10) || 3 : 3;
      const { error: ensureError } = await ensureSetLogRows(sessionExerciseId, rowCount);
      if (ensureError) throw ensureError;

      const { data: existingLogs, error: logsError } = await getSetLogsForSessionExercise(sessionExerciseId);
      if (logsError) throw logsError;

      setSets(
        (existingLogs ?? []).map((log: any) => ({
          id: log.id,
          setNumber: log.set_number,
          weight: log.weight != null ? String(log.weight) : '',
          reps: log.reps != null ? String(log.reps) : '',
          completed: log.completed,
        }))
      );

      if (clientId && exerciseId) {
        const { data: lastSets } = await getLastLoggedSets(clientId, exerciseId, id);
        setLastTimeText(formatLastTimeSets(lastSets ?? []));
      }
    } catch (err: any) {
      console.error('❌ Failed to load set-logging data:', err.message);
      Alert.alert('Couldn\u2019t Load Sets', err.message || 'An unexpected server issue occurred.');
    } finally {
      setLoading(false);
    }
  }, [sessionExerciseId, targetSets, clientId, exerciseId, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

  const startRestTimer = (seconds: number) => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestSecondsLeft(seconds);
    restIntervalRef.current = setInterval(() => {
      setRestSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (restIntervalRef.current) clearInterval(restIntervalRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const skipRestTimer = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestSecondsLeft(null);
  };

  const handleChangeField = (index: number, field: 'weight' | 'reps', value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value, completed: false };
      return next;
    });
  };

  // Autosaves whatever's currently typed the moment the trainer leaves a
  // field — not just when they tap the checkmark — so an in-progress set
  // (or one they never finish filling in) still has its latest values
  // persisted if they back out. Editing a previously-completed set's
  // numbers already reverted `completed` to false locally in
  // handleChangeField above; this persists that reversion too.
  const handleBlurSave = async (index: number) => {
    const row = sets[index];
    const parsedWeight = row.weight.trim() ? parseFloat(row.weight) : null;
    const parsedReps = row.reps.trim() ? parseInt(row.reps, 10) : null;

    try {
      const { error } = await updateSetLog(row.id, {
        weight: isNaN(parsedWeight as number) ? null : parsedWeight,
        reps: isNaN(parsedReps as number) ? null : parsedReps,
        completed: row.completed,
      });
      if (error) throw error;
    } catch (err: any) {
      // Silent-ish: a failed autosave shouldn't interrupt typing with a
      // popup. The checkmark tap (handleLogSet) still surfaces a hard error
      // if the trainer explicitly tries to confirm a set that can't save.
      console.error('❌ Failed to autosave set:', err.message);
    }
  };

  const handleLogSet = async (index: number) => {
    const row = sets[index];
    const parsedWeight = row.weight.trim() ? parseFloat(row.weight) : null;
    const parsedReps = row.reps.trim() ? parseInt(row.reps, 10) : null;

    try {
      const { error } = await updateSetLog(row.id, {
        weight: isNaN(parsedWeight as number) ? null : parsedWeight,
        reps: isNaN(parsedReps as number) ? null : parsedReps,
        completed: true,
      });
      if (error) throw error;

      setSets((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], completed: true };
        return next;
      });

      // The checkmark's only job is marking this set complete — starting a
      // rest timer as a side effect of that made it too easy to trigger by
      // accident. The rest-timer presets below remain the deliberate way to
      // start one.

      // First set logged this session bumps status out of 'planned'
      // automatically — the trainer clearly started the workout, no need to
      // make them tap a separate "Start Workout" button first. Fire-and-log
      // rather than await+block the UI on it; a failure here shouldn't stop
      // the set itself from being logged.
      if (!hasStartedSessionRef.current) {
        hasStartedSessionRef.current = true;
        updateWorkoutSessionStatus(id, 'in_progress').then(({ error: statusError }) => {
          if (statusError) console.error('❌ Failed to auto-start session:', statusError.message);
        });
      }
    } catch (err: any) {
      console.error('❌ Failed to log set:', err.message);
      Alert.alert('Log Failed', err.message || 'An unexpected server issue occurred.');
    }
  };

  // Tapping an already-completed set's checkmark un-marks it (back to
  // editable/incomplete) without touching its weight/reps — lets the
  // trainer quickly reopen a set to tweak it, then re-tap to confirm again.
  // Actually deleting a set's data is a separate, explicitly-confirmed
  // action (see handleRemoveSet) so it can't happen from a single mis-tap.
  const handleToggleComplete = async (index: number) => {
    const row = sets[index];
    if (!row.completed) {
      handleLogSet(index);
      return;
    }

    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], completed: false };
      return next;
    });

    try {
      const { error } = await updateSetLog(row.id, { completed: false });
      if (error) throw error;
    } catch (err: any) {
      console.error('❌ Failed to un-mark set:', err.message);
    }
  };

  const handleAddSet = async () => {
    const nextSetNumber = sets.length + 1;
    try {
      const { data, error } = await createBlankSetLog(sessionExerciseId, nextSetNumber);
      if (error) throw error;

      setSets((prev) => [
        ...prev,
        { id: data.id, setNumber: nextSetNumber, weight: '', reps: '', completed: false },
      ]);
    } catch (err: any) {
      console.error('❌ Failed to add set:', err.message);
      Alert.alert('Add Failed', err.message || 'An unexpected server issue occurred.');
    }
  };

  const handleRemoveSet = (index: number) => {
    const row = sets[index];

    const removeLocally = () => {
      setSets((prev) => {
        const next = prev.filter((_, i) => i !== index);
        // Renumber remaining sets so set_number stays contiguous (1, 2, 3…)
        return next.map((r, i) => ({ ...r, setNumber: i + 1 }));
      });
    };

    const removeFromServer = async () => {
      try {
        const { error } = await deleteSetLog(row.id);
        if (error) throw error;
        removeLocally();
      } catch (err: any) {
        console.error('❌ Failed to remove set:', err.message);
        Alert.alert('Remove Failed', err.message || 'An unexpected server issue occurred.');
      }
    };

    // A still-blank, never-confirmed row has nothing meaningful to lose —
    // remove it immediately, same as clearing an empty form field. Only a
    // row with real weight/reps or a completed confirmation needs the
    // confirmation step.
    const isBlank = !row.weight.trim() && !row.reps.trim() && !row.completed;
    if (isBlank) {
      removeFromServer();
      return;
    }

    Alert.alert('Remove Set', `Delete set ${row.setNumber}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: removeFromServer },
    ]);
  };

  const targetLabel =
    targetSets && targetReps ? `Target: ${targetSets} sets \u00d7 ${targetReps} reps` : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} size="large" color="#1C1C1E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{exerciseName || 'Exercise'}</Text>
        <View style={styles.iconButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {targetLabel ? <Text style={styles.targetLabel}>{targetLabel}</Text> : null}

          <View style={styles.lastTimeCard}>
            <Ionicons name="time-outline" size={16} color="#636366" />
            <Text style={styles.lastTimeText}>
              {lastTimeText ? `Last time: ${lastTimeText}` : 'No previous session for this exercise yet'}
            </Text>
          </View>

          {restSecondsLeft !== null && (
            <View style={styles.restBanner} testID="rest-timer-banner">
              <Text style={styles.restBannerText}>Resting… {restSecondsLeft}s</Text>
              <TouchableOpacity onPress={skipRestTimer} style={styles.restSkipButton}>
                <Text style={styles.restSkipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.restPresetRow}>
            {REST_PRESETS_SECONDS.map((secs) => (
              <TouchableOpacity
                key={secs}
                style={styles.restPresetButton}
                onPress={() => startRestTimer(secs)}
                testID={`rest-preset-${secs}`}
              >
                <Text style={styles.restPresetText}>{secs}s</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.setsHeaderRow}>
            <Text style={[styles.setsHeaderCell, styles.setNumberCol]}>SET</Text>
            <Text style={[styles.setsHeaderCell, styles.weightCol]}>WEIGHT</Text>
            <Text style={[styles.setsHeaderCell, styles.repsCol]}>REPS</Text>
            <View style={styles.actionColHeader} />
          </View>

          {sets.map((row, index) => (
            <View key={`set-${index}`} style={styles.setRow} testID={`set-row-${row.setNumber}`}>
              <Text style={[styles.setNumberText, styles.setNumberCol]}>{row.setNumber}</Text>
              <TextInput
                style={[styles.setInput, styles.weightCol]}
                keyboardType="decimal-pad"
                placeholder={'\u2014'}
                placeholderTextColor="#C7C7CC"
                value={row.weight}
                onChangeText={(v) => handleChangeField(index, 'weight', v)}
                onBlur={() => handleBlurSave(index)}
                testID={`weight-input-${row.setNumber}`}
              />
              <TextInput
                style={[styles.setInput, styles.repsCol]}
                keyboardType="number-pad"
                placeholder={'\u2014'}
                placeholderTextColor="#C7C7CC"
                value={row.reps}
                onChangeText={(v) => handleChangeField(index, 'reps', v)}
                onBlur={() => handleBlurSave(index)}
                testID={`reps-input-${row.setNumber}`}
              />
              <TouchableOpacity
                onPress={() => handleToggleComplete(index)}
                style={[styles.completeButton, row.completed && styles.completeButtonDone]}
                testID={`complete-set-${row.setNumber}`}
              >
                <Ionicons name="checkmark" size={16} color={row.completed ? '#FFF' : '#8E8E93'} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveSet(index)}
                style={styles.removeSetButton}
                testID={`remove-set-${row.setNumber}`}
              >
                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet} testID="add-set">
            <Ionicons name="add-circle" size={18} color="#1C1C1E" />
            <Text style={styles.addSetText}>Add Set</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  loader: { flex: 1 },
  navBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1, textAlign: 'center' },
  content: { padding: 24, paddingBottom: 60, gap: 14 },
  targetLabel: { fontSize: 13, fontWeight: '600', color: '#636366' },
  lastTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
  },
  lastTimeText: { flex: 1, fontSize: 13, color: '#3A3A3C' },
  restBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  restBannerText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  restSkipButton: { paddingHorizontal: 10, paddingVertical: 4 },
  restSkipText: { color: '#FFD60A', fontWeight: '700', fontSize: 13 },
  restPresetRow: { flexDirection: 'row', gap: 8 },
  restPresetButton: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  restPresetText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  setsHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginTop: 6 },
  setsHeaderCell: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 0.5 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  setNumberCol: { width: 36 },
  weightCol: { flex: 1 },
  repsCol: { flex: 1 },
  actionColHeader: { width: 68 },
  setNumberText: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  setInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    color: '#1C1C1E',
    fontSize: 15,
  },
  completeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonDone: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  removeSetButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 14,
    height: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  addSetText: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
});
