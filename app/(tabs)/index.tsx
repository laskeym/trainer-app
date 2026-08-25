import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  FlatList,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';

import { useAuth } from '../../lib/AuthContext';
import { getSessionsForDate, getSessionsForDateRange } from '../../lib/queries/sessions';
import MonthCalendarModal from '../../components/MonthCalendarModal';

// Deterministic color per workout type, so "Leg Day" always looks the same
// across cards/days instead of being random or hardcoded per-session.
const GRADIENT_PALETTE: [string, string][] = [
  ['#3A1C71', '#D76D77'], // Deep Coral Purple
  ['#1f4037', '#99f2c8'], // Emerald Sea
  ['#1e3c72', '#2a5298'], // Premium Royal Blue
  ['#e65c00', '#F9D423'], // Electric Sunset
];

function workoutTypeColor(workoutTypeName: string | undefined): [string, string] {
  if (!workoutTypeName) return GRADIENT_PALETTE[0];
  // Simple hash of the name so the same workout type always maps to the same color
  let hash = 0;
  for (let i = 0; i < workoutTypeName.length; i++) {
    hash = workoutTypeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PALETTE.length;
  return GRADIENT_PALETTE[index];
}

// Formats two ISO timestamps into "09:00 AM - 10:00 AM"
function formatTimeRange(start: string, end: string): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  return `${format(start)} - ${format(end)}`;
}

// Local-calendar-date formatting (not toISOString(), which shifts to UTC —
// for a trainer behind UTC, e.g. Buenos Aires, that can silently roll the
// date to "yesterday" late in the evening).
function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function TrainerDashboard() {
  const router = useRouter();
  const { session } = useAuth();

  // selectedDate is a real 'YYYY-MM-DD' string, computed from local calendar
  // date components (see toIsoDateLocal above).
  const [selectedDate, setSelectedDate] = useState(() => toIsoDateLocal(new Date()));
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const { data, error } = await getSessionsForDate(session.user.id, selectedDate);
    if (error) {
      setError(error.message);
    } else {
      setSessions(data ?? []);
    }
    setLoading(false);
  }, [session, selectedDate]);

  // useFocusEffect (not a plain useEffect) so this refetches every time the
  // dashboard tab regains focus — including when returning from the
  // schedule-session modal via router.back(). A plain useEffect keyed on
  // fetchSessions only reruns when `session`/`selectedDate` actually change,
  // and since tab screens stay mounted, coming back from the modal changes
  // neither — the list would otherwise show stale data until the user
  // switched days and back. Same pattern already used in clients.tsx.
  useFocusEffect(
    useCallback(() => {
      fetchSessions();
    }, [fetchSessions])
  );

  // Fetches which dates within a given month have at least one session, to
  // drive the calendar picker's dot indicators. monthAnchorIso is the 1st of
  // whichever month the calendar is currently showing.
  const fetchMarkedDatesForMonth = useCallback(async (monthAnchorIso: string) => {
    if (!session) return;
    const anchor = parseIsoDateLocal(monthAnchorIso);
    const monthStart = toIsoDateLocal(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    const monthEnd = toIsoDateLocal(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));

    const { data, error } = await getSessionsForDateRange(session.user.id, monthStart, monthEnd);
    if (!error && data) {
      setMarkedDates(new Set(data.map((s: any) => toIsoDateLocal(new Date(s.scheduled_start)))));
    }
  }, [session]);

  // Build the visible week strip as real dates around whichever date is
  // currently selected (not always "today"), so jumping to a future date via
  // the calendar picker re-centers the strip on that date's week too.
  const weekDays = React.useMemo(() => {
    const anchor = parseIsoDateLocal(selectedDate);
    const startOfWeek = new Date(anchor);
    startOfWeek.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7)); // Monday start

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const iso = toIsoDateLocal(d);
      return {
        id: iso,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        date: d.getDate().toString(),
        isoDate: iso,
      };
    });
  }, [selectedDate]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.monthLabel}>
            {parseIsoDateLocal(selectedDate).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            }).toUpperCase()}
          </Text>
          <Text style={styles.screenTitle}>Gym Schedule</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={20} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setCalendarVisible(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#111" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.calendarStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {weekDays.map((item) => {
            const isSelected = item.isoDate === selectedDate;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.dateBubble, isSelected && styles.selectedDateBubble]}
                onPress={() => setSelectedDate(item.isoDate)}
              >
                <Text style={[styles.dayLabel, isSelected && styles.selectedText]}>{item.day}</Text>
                <Text style={[styles.dateLabel, isSelected && styles.selectedText]}>{item.date}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={{ padding: 24, color: '#8E8E93' }}>Couldn't load sessions: {error}</Text>
      ) : sessions.length === 0 ? (
        <Text style={{ padding: 24, color: '#8E8E93' }}>No sessions scheduled for this day.</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.cardWrapper}
              onPress={() => router.push(`/session/${item.id}`)}
            >
              <LinearGradient
                colors={workoutTypeColor(item.day_type_template?.name)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardRow}>
                  <View style={styles.clientMetaHeader}>
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>{item.client.name.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={styles.clientNameHeaderLabel}>{item.client.name}</Text>
                      <Text style={styles.timeSlotLabel}>
                        {formatTimeRange(item.scheduled_start, item.scheduled_end)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actionPill}>
                    <Ionicons name="play" size={12} color="#FFF" />
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.workoutTypeLabel}>{item.day_type_template?.name}</Text>
                    <View style={styles.locationMeta}>
                      <Ionicons name="location" size={12} color="rgba(255,255,255,0.75)" />
                      <Text style={styles.locationText}>{item.location}</Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/session/new', params: { date: selectedDate } })}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      <MonthCalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        markedDates={markedDates}
        onMonthChange={fetchMarkedDatesForMonth}
        title="Jump to a Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9FB', // Crisp, clean light background matching image 2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 16,
  },
  monthLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    backgroundColor: '#E5E5EA',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarStrip: {
    marginTop: 20,
    paddingBottom: 8,
  },
  calendarScroll: {
    paddingHorizontal: 24,
    gap: 12,
  },
  dateBubble: {
    width: 60,
    height: 70,
    backgroundColor: '#E5E5EA',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDateBubble: {
    backgroundColor: '#1C1C1E', // High contrast active day color block
  },
  dayLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  dateLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 2,
  },
  selectedText: {
    color: '#FFF',
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  cardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardGradient: {
    padding: 20,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  workoutTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  timeSlotLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginTop: 2,
  },
  actionPill: {
    width: 28,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end', // Aligns bottom text and badge perfectly
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 14,
  },
  clientMetaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clientNameHeaderLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clientNameLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  locationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  packageBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  packageText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  // add to your existing StyleSheet.create({...}) block
fab: {
    position: 'absolute',
    right: 24,
    bottom: 36, // clears the 60px tab bar + its 8px bottom padding, plus a bit of breathing room
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1C1C1E', // matches your selectedDateBubble/high-contrast accent color
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6, // Android shadow equivalent
  },
});
