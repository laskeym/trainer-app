// app/templates/[id]/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { supabase } from '../../../lib/supabase';
import {
  getDayTypeTemplateWithExercises,
  addTemplateExercise,
  updateTemplateExerciseTargets,
  removeTemplateExercise,
  reorderTemplateExercises,
} from '../../../lib/queries/templates';
import { getExercisesForTrainer, createExercise } from '../../../lib/queries/exercises';
import { getSuggestedMuscleGroups } from '../../../lib/dayTypeSuggestions';

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<any>(null);
  const [targetInputs, setTargetInputs] = useState<Record<string, { sets: string; reps: string }>>({});

  const [pickerVisible, setPickerVisible] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customExercise, setCustomExercise] = useState({ name: '', muscleGroup: '', equipment: '' });
  const [creatingCustom, setCreatingCustom] = useState(false);

  const syncTargetInputs = useCallback((exercises: any[]) => {
    const next: Record<string, { sets: string; reps: string }> = {};
    for (const ex of exercises) {
      next[ex.id] = {
        sets: ex.target_sets != null ? String(ex.target_sets) : '',
        reps: ex.target_reps != null ? String(ex.target_reps) : '',
      };
    }
    setTargetInputs(next);
  }, []);

  const fetchTemplate = useCallback(async () => {
    try {
      const { data, error } = await getDayTypeTemplateWithExercises(id);
      if (error) throw error;
      setTemplate(data);
      syncTargetInputs(data?.exercises ?? []);
    } catch (err: any) {
      console.error('❌ Failed to load template detail:', err.message);
      Alert.alert('Couldn\u2019t Load Template', err.message || 'An unexpected server issue occurred.');
    } finally {
      setLoading(false);
    }
  }, [id, syncTargetInputs]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

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

  // Splits the filtered library into a "Suggested for <name>" group (based
  // on muscle groups relevant to the template's name — see
  // getSuggestedMuscleGroups) followed by everything else, with header rows
  // injected between them. If nothing matches the template's name (e.g. it's
  // named something that doesn't map to a known day-type keyword), this
  // collapses to a single flat list with no header, same as before.
  type PickerRow =
    | { type: 'header'; key: string; label: string }
    | { type: 'exercise'; key: string; exercise: any };

  const pickerRows: PickerRow[] = (() => {
    const suggestedGroups = template ? getSuggestedMuscleGroups(template.name) : [];
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
      { type: 'header', key: 'header-suggested', label: `Suggested for ${template.name}` },
      ...suggested.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex })),
    ];
    if (others.length > 0) {
      rows.push({ type: 'header', key: 'header-all', label: 'All Exercises' });
      rows.push(...others.map((ex) => ({ type: 'exercise' as const, key: ex.id, exercise: ex })));
    }
    return rows;
  })();

  const handleAddExercise = async (exerciseId: string) => {
    setAddingExerciseId(exerciseId);
    try {
      const nextOrder = template?.exercises?.length ?? 0;
      const { data, error } = await addTemplateExercise({
        templateId: id,
        exerciseId,
        order: nextOrder,
        targetSets: null,
        targetReps: null,
      });
      if (error) throw error;

      setTemplate((prev: any) => {
        const updatedExercises = [...prev.exercises, data];
        syncTargetInputs(updatedExercises);
        return { ...prev, exercises: updatedExercises };
      });
      setPickerVisible(false);
      setLibrarySearch('');
    } catch (err: any) {
      console.error('❌ Failed to add exercise to template:', err.message);
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

      // Go straight from "created" to "added to this template" — a custom
      // exercise the trainer just typed in has nowhere else useful to sit.
      await handleAddExercise(data.id);
    } catch (err: any) {
      console.error('❌ Failed to create custom exercise:', err.message);
      Alert.alert('Creation Failed', err.message || 'An unexpected server issue occurred.');
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleRemoveExercise = (templateExerciseId: string) => {
    Alert.alert('Remove Exercise', 'Remove this exercise from the template?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await removeTemplateExercise(templateExerciseId);
            if (error) throw error;

            setTemplate((prev: any) => {
              const remaining = prev.exercises.filter((ex: any) => ex.id !== templateExerciseId);
              syncTargetInputs(remaining);
              return { ...prev, exercises: remaining };
            });
          } catch (err: any) {
            console.error('❌ Failed to remove exercise:', err.message);
            Alert.alert('Remove Failed', err.message || 'An unexpected server issue occurred.');
          }
        },
      },
    ]);
  };

  const handleDragEnd = async ({ data }: { data: any[] }) => {
    // Update locally right away so the reorder feels instant, then persist.
    setTemplate((prev: any) => ({ ...prev, exercises: data }));

    try {
      const { error } = await reorderTemplateExercises(data.map((ex) => ({ id: ex.id })));
      if (error) throw error;
    } catch (err: any) {
      console.error('❌ Failed to persist exercise order:', err.message);
      Alert.alert('Reorder Failed', err.message || 'An unexpected server issue occurred.');
      fetchTemplate(); // fall back to the server's actual order
    }
  };

  const handleTargetBlur = async (templateExerciseId: string) => {
    const inputs = targetInputs[templateExerciseId];
    if (!inputs) return;

    const parsedSets = inputs.sets.trim() ? parseInt(inputs.sets, 10) : null;
    const parsedReps = inputs.reps.trim() ? parseInt(inputs.reps, 10) : null;

    try {
      const { error } = await updateTemplateExerciseTargets(templateExerciseId, {
        targetSets: isNaN(parsedSets as number) ? null : parsedSets,
        targetReps: isNaN(parsedReps as number) ? null : parsedReps,
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('❌ Failed to save exercise targets:', err.message);
      Alert.alert('Save Failed', err.message || 'An unexpected server issue occurred.');
    }
  };

  if (loading || !template) {
    return (
      <SafeAreaView style={styles.centerLoader}>
        <ActivityIndicator size="large" color="#1C1C1E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{template.name}</Text>
        <View style={styles.iconButton} />
      </View>

      <NestableScrollContainer contentContainerStyle={styles.scrollLayout} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionHeader}>EXERCISES</Text>

        <NestableDraggableFlatList
          data={template.exercises}
          keyExtractor={(ex: any) => ex.id}
          onDragEnd={handleDragEnd}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No exercises yet. Add some below to build out this template.
            </Text>
          }
          renderItem={({ item: ex, drag, isActive }: any) => (
            <ScaleDecorator>
              <View
                style={[styles.exerciseCard, isActive && styles.exerciseCardActive]}
                testID={`template-exercise-${ex.id}`}
              >
                <View style={styles.exerciseCardTop}>
                  <View style={styles.exerciseNameBlock}>
                    <Text style={styles.exerciseName}>{ex.exercise?.name}</Text>
                    {(ex.exercise?.muscle_group || ex.exercise?.equipment) && (
                      <Text style={styles.exerciseSubtitle} numberOfLines={1}>
                        {[ex.exercise?.muscle_group, ex.exercise?.equipment].filter(Boolean).join(' \u2022 ')}
                      </Text>
                    )}
                  </View>

                  {/* Long-press anywhere on this handle to pick the row up —
                      matches the standard native reorder gesture, and keeps
                      drag activation away from the SETS/REPS text inputs and
                      the remove button below so they stay normal taps. */}
                  <TouchableOpacity
                    onLongPress={drag}
                    disabled={isActive}
                    delayLongPress={150}
                    style={styles.dragHandle}
                    testID={`drag-handle-${ex.id}`}
                  >
                    <Ionicons name="reorder-three-outline" size={22} color="#8E8E93" />
                  </TouchableOpacity>
                </View>

                <View style={styles.targetsRow}>
                  <View style={styles.targetField}>
                    <Text style={styles.targetLabel}>SETS</Text>
                    <TextInput
                      style={styles.targetInput}
                      keyboardType="numeric"
                      placeholder={'\u2014'}
                      placeholderTextColor="#C7C7CC"
                      value={targetInputs[ex.id]?.sets ?? ''}
                      onChangeText={(v) =>
                        setTargetInputs((prev) => ({ ...prev, [ex.id]: { ...prev[ex.id], sets: v } }))
                      }
                      onBlur={() => handleTargetBlur(ex.id)}
                    />
                  </View>
                  <View style={styles.targetField}>
                    <Text style={styles.targetLabel}>REPS</Text>
                    <TextInput
                      style={styles.targetInput}
                      keyboardType="numeric"
                      placeholder={'\u2014'}
                      placeholderTextColor="#C7C7CC"
                      value={targetInputs[ex.id]?.reps ?? ''}
                      onChangeText={(v) =>
                        setTargetInputs((prev) => ({ ...prev, [ex.id]: { ...prev[ex.id], reps: v } }))
                      }
                      onBlur={() => handleTargetBlur(ex.id)}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveExercise(ex.id)}
                    testID={`remove-${ex.id}`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            </ScaleDecorator>
          )}
        />

        <TouchableOpacity style={styles.addExerciseButton} onPress={openPicker}>
          <Ionicons name="add-circle" size={18} color="#1C1C1E" />
          <Text style={styles.addExerciseText}>Add Exercise</Text>
        </TouchableOpacity>
      </NestableScrollContainer>

      {/* Exercise picker modal */}
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
  container: {
    flex: 1,
    backgroundColor: '#F9F9FB',
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9FB',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    textAlign: 'center',
  },
  scrollLayout: {
    padding: 24,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  exerciseCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  exerciseCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  exerciseNameBlock: {
    flex: 1,
    paddingRight: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  exerciseSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  exerciseCardActive: {
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  dragHandle: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  targetField: {
    gap: 4,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  targetInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    width: 72,
    color: '#1C1C1E',
    fontSize: 15,
  },
  removeButton: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF0EF',
    justifyContent: 'center',
    alignItems: 'center',
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
});
