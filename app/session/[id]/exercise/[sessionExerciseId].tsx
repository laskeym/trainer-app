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
  upsertSetLog,
  deleteSetLog,
  getLastLoggedSets,
} from '../../../../lib/queries/setLogs';

type SetRow = {
  // A real id once the trainer has saved this set at least once; null for
  // a still-empty row that only exists locally.
  id: string | null;
  setNumber: number;
  weight: string;
  reps: string;
  saved: boolean;
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
  const { id, sessionExerciseId, exerciseName, targetSets, targetReps, clientId, exerciseId } =
    useLocalSearchParams<{
      id: string;
      sessionExerciseId: string;
      exerciseName?: string;
      targetSets?: string;
      targetReps?: string;
      clientId?: string;
      exerciseId?: string;
    }>();

  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [lastTimeText, setLastTimeText] = useState<string | null>(null);

  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: existingLogs, error: logsError } = await getSetLogsForSessionExercise(sessionExerciseId);
      if (logsError) throw logsError;

      let initialRows: SetRow[];
      if (existingLogs && existingLogs.length > 0) {
        initialRows = existingLogs.map((log: any) => ({
          id: log.id,
          setNumber: log.set_number,
          weight: log.weight != null ? String(log.weight) : '',
          reps: log.reps != null ? String(log.reps) : '',
          saved: true,
        }));
      } else {
        // Nothing logged yet this session — pre-populate empty rows to
        // match the template's target set count (default 3 if unknown), so
        // the trainer has the right number of rows ready to fill in rather
        // than tapping "+ Add Set" repeatedly before they've even started.
        const rowCount = targetSets ? parseInt(targetSets, 10) || 3 : 3;
        initialRows = Array.from({ length: rowCount }, (_, i) => ({
          id: null,
          setNumber: i + 1,
          weight: '',
          reps: '',
          saved: false,
        }));
      }
      setSets(initialRows);

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
      next[index] = { ...next[index], [field]: value, saved: false };
      return next;
    });
  };

  const handleLogSet = async (index: number) => {
    const row = sets[index];
    const parsedWeight = row.weight.trim() ? parseFloat(row.weight) : null;
    const parsedReps = row.reps.trim() ? parseInt(row.reps, 10) : null;

    try {
      const { data, error } = await upsertSetLog({
        sessionExerciseId,
        setNumber: row.setNumber,
        weight: isNaN(parsedWeight as number) ? null : parsedWeight,
        reps: isNaN(parsedReps as number) ? null : parsedReps,
      });
      if (error) throw error;

      setSets((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], id: data.id, saved: true };
        return next;
      });

      // Rest timer kicks in right after a set is logged — that's the actual
      // moment the trainer needs it, between this set and the next.
      startRestTimer(REST_PRESETS_SECONDS[0]);
    } catch (err: any) {
      console.error('❌ Failed to log set:', err.message);
      Alert.alert('Log Failed', err.message || 'An unexpected server issue occurred.');
    }
  };

  const handleAddSet = () => {
    setSets((prev) => [
      ...prev,
      { id: null, setNumber: prev.length + 1, weight: '', reps: '', saved: false },
    ]);
  };

  const handleRemoveSet = async (index: number) => {
    const row = sets[index];

    const removeLocally = () => {
      setSets((prev) => {
        const next = prev.filter((_, i) => i !== index);
        // Renumber remaining sets so set_number stays contiguous (1, 2, 3…)
        return next.map((r, i) => ({ ...r, setNumber: i + 1 }));
      });
    };

    if (!row.id) {
      removeLocally();
      return;
    }

    try {
      const { error } = await deleteSetLog(row.id);
      if (error) throw error;
      removeLocally();
    } catch (err: any) {
      console.error('❌ Failed to remove set:', err.message);
      Alert.alert('Remove Failed', err.message || 'An unexpected server issue occurred.');
    }
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
            <View style={styles.actionCol} />
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
                testID={`weight-input-${row.setNumber}`}
              />
              <TextInput
                style={[styles.setInput, styles.repsCol]}
                keyboardType="number-pad"
                placeholder={'\u2014'}
                placeholderTextColor="#C7C7CC"
                value={row.reps}
                onChangeText={(v) => handleChangeField(index, 'reps', v)}
                testID={`reps-input-${row.setNumber}`}
              />
              <View style={styles.actionCol}>
                {row.saved ? (
                  <TouchableOpacity
                    onPress={() => handleRemoveSet(index)}
                    style={styles.removeSetButton}
                    testID={`remove-set-${row.setNumber}`}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleLogSet(index)}
                    style={styles.logSetButton}
                    testID={`log-set-${row.setNumber}`}
                  >
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </TouchableOpacity>
                )}
              </View>
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
  actionCol: { width: 40, alignItems: 'center' },
  setNumberText: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  setInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    color: '#1C1C1E',
    fontSize: 15,
  },
  logSetButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
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
