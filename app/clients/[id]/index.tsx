// app/clients/[id]/index.tsx
import React, { useState, useCallback } from 'react';
import { 
  Alert,
  Modal,
  Pressable,
  StyleSheet, 
  Text, 
  TextInput,
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getClientDetailsWithHistory,
  deleteClient,
  createClientMetric,
  updateClientMetric,
  deleteClientMetric,
} from '../../../lib/queries/clients';
import MonthCalendarModal from '../../../components/MonthCalendarModal';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

// Local-calendar-date formatting, not new Date(iso) directly — a bare
// 'YYYY-MM-DD' string parses as UTC midnight per spec, which rolls back to
// the previous day for any timezone behind UTC. Same reasoning as
// toIsoDateLocal/parseIsoDateLocal elsewhere in this app (dashboard,
// MonthCalendarModal, session scheduling).
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientProfileDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const [metricModalVisible, setMetricModalVisible] = useState(false);
  const [metricDatePickerVisible, setMetricDatePickerVisible] = useState(false);
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [metricForm, setMetricForm] = useState({ date: todayIso(), weight: '', bodyFatPct: '' });
  const [savingMetric, setSavingMetric] = useState(false);

  const fetchFullProfile = useCallback(async () => {
    try {
      const { data, error } = await getClientDetailsWithHistory(id as string);
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('❌ Error fetching profile history dataset:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // useFocusEffect (not a plain useEffect) so this refetches every time the
  // screen regains focus — including when returning from editing the
  // client profile. Stack screens stay mounted when another screen is
  // pushed on top, so a plain mount-effect would keep showing the stale
  // pre-edit name/goals/constraints after saving. Same fix already applied
  // to the dashboard and session detail screens for the same reason.
  useFocusEffect(
    useCallback(() => {
      fetchFullProfile();
    }, [fetchFullProfile])
  );

  const openLogMetricModal = () => {
    setEditingMetricId(null);
    setMetricForm({ date: todayIso(), weight: '', bodyFatPct: '' });
    setMetricModalVisible(true);
  };

  const openEditMetricModal = (metric: any) => {
    setEditingMetricId(metric.id);
    setMetricForm({
      date: metric.date,
      weight: metric.weight != null ? String(metric.weight) : '',
      bodyFatPct: metric.body_fat_pct != null ? String(metric.body_fat_pct) : '',
    });
    setMetricModalVisible(true);
  };

  const handleSaveMetric = async () => {
    if (!metricForm.weight.trim() && !metricForm.bodyFatPct.trim()) {
      Alert.alert('Required Field', 'Enter a weight, body fat percentage, or both.');
      return;
    }

    const parsedWeight = metricForm.weight.trim() ? parseFloat(metricForm.weight) : null;
    const parsedBodyFat = metricForm.bodyFatPct.trim() ? parseFloat(metricForm.bodyFatPct) : null;
    const safeWeight = isNaN(parsedWeight as number) ? null : parsedWeight;
    const safeBodyFat = isNaN(parsedBodyFat as number) ? null : parsedBodyFat;

    setSavingMetric(true);
    try {
      if (editingMetricId) {
        const { error } = await updateClientMetric(editingMetricId, {
          date: metricForm.date,
          weight: safeWeight,
          bodyFatPct: safeBodyFat,
        });
        if (error) throw error;
      } else {
        const { error } = await createClientMetric({
          clientId: id as string,
          date: metricForm.date,
          weight: safeWeight,
          bodyFatPct: safeBodyFat,
        });
        if (error) throw error;
      }

      setMetricModalVisible(false);
      await fetchFullProfile();
    } catch (err: any) {
      console.error('❌ Failed to save metric entry:', err.message);
      Alert.alert('Save Failed', err.message || 'An unexpected server issue occurred.');
    } finally {
      setSavingMetric(false);
    }
  };

  const handleDeleteMetric = (metricId: string) => {
    Alert.alert('Delete Entry', 'Delete this metric log entry? This can\u2019t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await deleteClientMetric(metricId);
            if (error) throw error;
            await fetchFullProfile();
          } catch (err: any) {
            console.error('❌ Failed to delete metric entry:', err.message);
            Alert.alert('Delete Failed', err.message || 'An unexpected server issue occurred.');
          }
        },
      },
    ]);
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.centerLoader}>
        <ActivityIndicator size="large" color="#1C1C1E" />
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete Client',
      `Delete ${profile.name}? This removes their profile, metric history, and every scheduled or logged session. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await deleteClient(profile.id);
              if (error) throw error;
              router.back();
            } catch (err: any) {
              console.error('❌ Failed to delete client:', err.message);
              Alert.alert('Delete Failed', err.message || 'An unexpected server issue occurred.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Custom Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Client Profile</Text>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/clients/new', params: { editClientId: profile.id } })}
            style={styles.iconButton}
            disabled={deleting}
            testID="edit-client-button"
          >
            <Ionicons name="pencil-outline" size={20} color="#1C1C1E" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.iconButton}
            disabled={deleting}
            testID="delete-client-button"
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollLayout} showsVerticalScrollIndicator={false}>
        {/* Top Header Card Block */}
        <View style={styles.profileHeroCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{profile.name.charAt(0)}</Text>
          </View>
          <Text style={styles.clientNameTitle}>{profile.name}</Text>
          
          {/* Horizontal Profile Static & Dynamic Metrics Preview Pills Row */}
          <View style={styles.tagsRow}>
            <View style={styles.profileMetricTag}>
              <Ionicons name="resize-outline" size={13} color="#8E8E93" />
              <Text style={styles.tagText}>H: {profile.height}</Text>
            </View>
            <View style={styles.profileMetricTag}>
              <Ionicons name="scale-outline" size={13} color="#8E8E93" />
              <Text style={styles.tagText}>W: {profile.currentWeight}</Text>
            </View>
            <View style={styles.profileMetricTag}>
              <Ionicons name="fitness-outline" size={13} color="#8E8E93" />
              <Text style={styles.tagText}>BF: {profile.currentBodyFat}</Text>
            </View>
          </View>
        </View>

        {/* Static Profile Attributes Section */}
        <View style={styles.attributesContainer}>
          <Text style={styles.sectionHeader}>STATIC ATTRIBUTES</Text>
          
          <View style={styles.attributeBlock}>
            <Text style={styles.attributeLabel}>FITNESS GOAL OR FOCUS</Text>
            <Text style={styles.attributeValueText}>{profile.fitnessGoals}</Text>
          </View>

          <View style={[styles.attributeBlock, profile.medicalConstraints !== 'None' && styles.dangerBorder]}>
            <Text style={[styles.attributeLabel, profile.medicalConstraints !== 'None' && { color: '#FF3B30' }]}>
              MEDICAL CONSTRAINTS
            </Text>
            <Text style={styles.attributeValueText}>{profile.medicalConstraints}</Text>
          </View>
        </View>

        {/* Dynamic Metric Progress Tracking Section */}
        <View style={styles.metricsContainer}>
          <View style={styles.metricsHeaderRow}>
            <Text style={styles.sectionHeader}>DYNAMIC METRIC HISTORY</Text>
            <TouchableOpacity style={styles.addMetricTextButton} onPress={openLogMetricModal} testID="log-metric-button">
              <Ionicons name="add-circle" size={16} color="#1C1C1E" />
              <Text style={styles.addMetricText}>Log Metrics</Text>
            </TouchableOpacity>
          </View>

          {/* Historical Data Feed Table Rows */}
          {profile.metricsHistory.length === 0 ? (
            <Text style={styles.emptyMetricsText}>No historical metric logs found for this client.</Text>
          ) : (
            profile.metricsHistory.map((metric: any) => (
              <View key={metric.id} style={styles.metricRowCard}>
                <TouchableOpacity
                  style={styles.metricRowBody}
                  onPress={() => openEditMetricModal(metric)}
                  testID={`metric-row-${metric.id}`}
                >
                  <View>
                    <Text style={styles.metricDateText}>
                      {formatDateLabel(metric.date)}
                    </Text>
                  </View>
                  <View style={styles.metricValuesGroup}>
                    <View style={styles.valueItem}>
                      <Text style={styles.valueMetaLabel}>WEIGHT</Text>
                      <Text style={styles.valueNumber}>{metric.weight ? `${metric.weight} kg` : '--'}</Text>
                    </View>
                    <View style={styles.valueItem}>
                      <Text style={styles.valueMetaLabel}>BODY FAT</Text>
                      <Text style={styles.valueNumber}>{metric.body_fat_pct ? `${metric.body_fat_pct}%` : '--'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.metricDeleteButton}
                  onPress={() => handleDeleteMetric(metric.id)}
                  testID={`delete-metric-${metric.id}`}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Log/Edit Metric modal */}
      <Modal
        visible={metricModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMetricModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMetricModalVisible(false)}>
          <Pressable style={styles.metricSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingMetricId ? 'Edit Metric Entry' : 'Log Metrics'}</Text>
              <TouchableOpacity onPress={() => setMetricModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DATE</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setMetricDatePickerVisible(true)}
                disabled={savingMetric}
              >
                <Text style={styles.selectFieldText}>{formatDateLabel(metricForm.date)}</Text>
                <Ionicons name="calendar-outline" size={18} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>WEIGHT (KG)</Text>
              <TextInput
                placeholder="78"
                placeholderTextColor="#C7C7CC"
                keyboardType="decimal-pad"
                style={styles.metricInputField}
                value={metricForm.weight}
                onChangeText={(v) => setMetricForm((p) => ({ ...p, weight: v }))}
                editable={!savingMetric}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BODY FAT %</Text>
              <TextInput
                placeholder="15"
                placeholderTextColor="#C7C7CC"
                keyboardType="decimal-pad"
                style={styles.metricInputField}
                value={metricForm.bodyFatPct}
                onChangeText={(v) => setMetricForm((p) => ({ ...p, bodyFatPct: v }))}
                editable={!savingMetric}
              />
            </View>

            <TouchableOpacity
              style={[styles.metricSubmitButton, savingMetric && styles.disabledButton]}
              onPress={handleSaveMetric}
              disabled={savingMetric}
              testID="save-metric-submit"
            >
              {savingMetric ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.metricSubmitText}>{editingMetricId ? 'Save Changes' : 'Log Entry'}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <MonthCalendarModal
        visible={metricDatePickerVisible}
        onClose={() => setMetricDatePickerVisible(false)}
        selectedDate={metricForm.date}
        onSelectDate={(iso) => setMetricForm((p) => ({ ...p, date: iso }))}
        title="Select a Date"
      />
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
  navActions: {
    flexDirection: 'row',
    gap: 4,
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
  },
  scrollLayout: {
    padding: 24,
    gap: 24,
  },
  profileHeroCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    backgroundColor: '#1C1C1E',
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  clientNameTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  profileMetricTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#48484A',
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  attributesContainer: {
    gap: 2,
  },
  attributeBlock: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  dangerBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  attributeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  attributeValueText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
    lineHeight: 20,
  },
  metricsContainer: {
    gap: 2,
  },
  metricsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addMetricTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  addMetricText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  metricRowCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  metricRowBody: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricDeleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0EF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricDateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  metricValuesGroup: {
    flexDirection: 'row',
    gap: 24,
  },
  valueItem: {
    alignItems: 'flex-end',
  },
  valueMetaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  valueNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 2,
  },
  emptyMetricsText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  metricSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  selectField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  selectFieldText: {
    color: '#1C1C1E',
    fontSize: 15,
  },
  metricInputField: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    color: '#1C1C1E',
    fontSize: 15,
  },
  metricSubmitButton: {
    backgroundColor: '#1C1C1E',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  disabledButton: {
    backgroundColor: '#3A3A3C',
    opacity: 0.7,
  },
  metricSubmitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
