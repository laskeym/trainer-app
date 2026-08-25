// app/session/new.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { createWorkoutSession } from '../../lib/queries/sessions';
import { getClientsForTrainer } from '../../lib/queries/clients';
import { getDayTypeTemplatesForTrainer } from '../../lib/queries/templates';
import MonthCalendarModal from '../../components/MonthCalendarModal';

// 30-minute slots from 6:00 AM to 8:30 PM, stored as 24hr 'HH:mm' internally
// so building the scheduled timestamp later is unambiguous.
const START_TIME_OPTIONS = Array.from({ length: 30 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const value = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const label = `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
  return { value, label };
});

const DURATION_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 hr' },
  { minutes: 90, label: '1.5 hr' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function formatDateLabel(iso: string): string {
  // Parse as local calendar date, not UTC, so it doesn't shift a day off.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function buildScheduledTimestamp(dateIso: string, time24: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = time24.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function addMinutesToTime(time24: string, minutesToAdd: number): string {
  const [hour, minute] = time24.split(':').map(Number);
  const total = hour * 60 + minute + minutesToAdd;
  const newHour = Math.floor(total / 60) % 24;
  const newMinute = total % 60;
  return `${newHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
}

function formatTime24(time24: string): string {
  const [hour, minute] = time24.split(':').map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

export default function ScheduleSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  const [loading, setLoading] = useState(false);
  const [trainerId, setTrainerId] = useState<string | null>(null);

  const [clients, setClients] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [form, setForm] = useState({
    clientId: '' as string,
    clientName: '' as string,
    dayTypeTemplateId: null as string | null,
    dayTypeTemplateName: 'No Template' as string,
    date: (typeof params.date === 'string' && params.date) || todayIso(),
    startTime: '09:00',
    durationMinutes: 60,
    location: '',
  });

  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message || 'Authenticated trainer session not found.');
      }
      setTrainerId(user.id);

      const [clientsResult, templatesResult] = await Promise.all([
        getClientsForTrainer(user.id),
        getDayTypeTemplatesForTrainer(user.id),
      ]);

      if (clientsResult.error) throw clientsResult.error;
      if (templatesResult.error) throw templatesResult.error;

      setClients(clientsResult.data ?? []);
      setTemplates(templatesResult.data ?? []);
    } catch (error: any) {
      console.error('❌ Failed to load scheduling options:', error.message);
      Alert.alert('Couldn\u2019t Load Data', error.message || 'An unexpected server issue occurred.');
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const filteredClients = clients.filter((c) =>
    c.name?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const endTime = addMinutesToTime(form.startTime, form.durationMinutes);

  const handleSave = async () => {
    if (!form.clientId) {
      Alert.alert('Required Field', 'Please select a client for this session.');
      return;
    }
    if (!trainerId) {
      Alert.alert('Not Ready', 'Still confirming your trainer session — try again in a moment.');
      return;
    }

    setLoading(true);

    try {
      const scheduledStart = buildScheduledTimestamp(form.date, form.startTime);
      const scheduledEnd = buildScheduledTimestamp(form.date, endTime);

      const { error: insertError } = await createWorkoutSession({
        trainerId,
        clientId: form.clientId,
        dayTypeTemplateId: form.dayTypeTemplateId,
        scheduledStart,
        scheduledEnd,
        location: form.location.trim() || null,
      });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Session scheduled!', [
        { text: 'OK', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error('❌ Failed to schedule session:', error.message);
      Alert.alert('Scheduling Failed', error.message || 'An unexpected server issue occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          disabled={loading}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Schedule Session</Text>
        <View style={{ width: 40 }} />
      </View>

      {loadingOptions ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Client picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CLIENT *</Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setClientPickerVisible(true)}
              disabled={loading}
            >
              <Text style={form.clientId ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                {form.clientId ? form.clientName : 'Select a client'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Workout type / template picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>WORKOUT TYPE</Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setTemplatePickerVisible(true)}
              disabled={loading}
            >
              <Text style={styles.selectFieldText}>{form.dayTypeTemplateName}</Text>
              <Ionicons name="chevron-down" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Date picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DATE *</Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setDatePickerVisible(true)}
              disabled={loading}
            >
              <Text style={styles.selectFieldText}>{formatDateLabel(form.date)}</Text>
              <Ionicons name="calendar-outline" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Start time */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>START TIME *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {START_TIME_OPTIONS.map((opt) => {
                const isSelected = opt.value === form.startTime;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                    onPress={() => setForm((p) => ({ ...p, startTime: opt.value }))}
                    disabled={loading}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Duration */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DURATION *</Text>
            <View style={styles.pillRow}>
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = opt.minutes === form.durationMinutes;
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                    onPress={() => setForm((p) => ({ ...p, durationMinutes: opt.minutes }))}
                    disabled={loading}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              {formatTime24(form.startTime)} – {formatTime24(endTime)}
            </Text>
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>LOCATION</Text>
            <TextInput
              placeholder="Main Floor, Studio B..."
              placeholderTextColor="#C7C7CC"
              style={styles.inputField}
              value={form.location}
              onChangeText={(v) => setForm((p) => ({ ...p, location: v }))}
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            testID="schedule-session-submit"
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Schedule Session</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Client picker modal */}
      <Modal visible={clientPickerVisible} transparent animationType="slide" onRequestClose={() => setClientPickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setClientPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Client</Text>
              <TouchableOpacity onPress={() => setClientPickerVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Search by client name..."
              placeholderTextColor="#C7C7CC"
              style={styles.searchInput}
              value={clientSearch}
              onChangeText={setClientSearch}
            />
            <FlatList
              data={filteredClients}
              keyExtractor={(item) => item.id}
              style={styles.pickerList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setForm((p) => ({ ...p, clientId: item.id, clientName: item.name }));
                    setClientPickerVisible(false);
                    setClientSearch('');
                  }}
                >
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                  {form.clientId === item.id && <Ionicons name="checkmark" size={18} color="#1C1C1E" />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyListText}>No clients found.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Template picker modal */}
      <Modal visible={templatePickerVisible} transparent animationType="slide" onRequestClose={() => setTemplatePickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTemplatePickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Workout Type</Text>
              <TouchableOpacity onPress={() => setTemplatePickerVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: null, name: 'No Template' }, ...templates]}
              keyExtractor={(item) => item.id ?? 'none'}
              style={styles.pickerList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setForm((p) => ({ ...p, dayTypeTemplateId: item.id, dayTypeTemplateName: item.name }));
                    setTemplatePickerVisible(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                  {form.dayTypeTemplateId === item.id && <Ionicons name="checkmark" size={18} color="#1C1C1E" />}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <MonthCalendarModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        selectedDate={form.date}
        onSelectDate={(iso) => setForm((p) => ({ ...p, date: iso }))}
        title="Select a Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  backButton: {
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
  formScroll: {
    padding: 24,
    gap: 20,
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
  inputField: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    color: '#1C1C1E',
    fontSize: 15,
  },
  selectField: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectFieldText: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '500',
  },
  selectFieldPlaceholder: {
    color: '#C7C7CC',
    fontSize: 15,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  pillSelected: {
    backgroundColor: '#1C1C1E',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  pillTextSelected: {
    color: '#FFF',
  },
  helperText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: '#1C1C1E',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  disabledButton: {
    backgroundColor: '#3A3A3C',
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
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
    maxHeight: '70%',
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
  emptyListText: {
    textAlign: 'center',
    color: '#8E8E93',
    paddingVertical: 24,
  },
});
