import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toIsoDate(d: Date): string {
  // Local-date formatting (not toISOString(), which shifts to UTC and can
  // land on the wrong day depending on the device's timezone).
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The inverse of toIsoDate — new Date('YYYY-MM-DD') parses as UTC midnight
// per spec, which can roll to the wrong calendar day/month for timezones
// behind UTC (e.g. Buenos Aires). Parse the components as local time instead.
function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday-first 6x7 grid of dates surrounding the given month, including
// leading/trailing days from adjacent months so every week row is full.
function buildMonthGrid(monthAnchor: Date): Date[] {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  // getDay(): 0=Sun..6=Sat. Convert to Monday-first offset.
  const leadingOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - leadingOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

interface MonthCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string; // 'YYYY-MM-DD'
  onSelectDate: (date: string) => void;
  markedDates?: Set<string>; // dates ('YYYY-MM-DD') that should show a dot
  title?: string;
  onMonthChange?: (monthAnchorIso: string) => void; // fires with the 1st of whichever month is now visible
}

export default function MonthCalendarModal({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
  markedDates,
  title = 'Jump to a Date',
  onMonthChange,
}: MonthCalendarModalProps) {
  const [viewedMonth, setViewedMonth] = useState(() => parseIsoDateLocal(selectedDate));

  // Re-sync the visible month to the currently selected date every time the
  // picker is opened, so it doesn't reopen on whatever month was last browsed.
  useEffect(() => {
    if (visible) {
      setViewedMonth(parseIsoDateLocal(selectedDate));
    }
  }, [visible, selectedDate]);

  useEffect(() => {
    if (visible) {
      onMonthChange?.(toIsoDate(new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, viewedMonth]);

  const todayIso = toIsoDate(new Date());
  const gridDates = buildMonthGrid(viewedMonth);

  const goToPrevMonth = () => {
    setViewedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setViewedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.monthNavButton}>
              <Ionicons name="chevron-back" size={20} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {viewedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.monthNavButton}>
              <Ionicons name="chevron-forward" size={20} color="#1C1C1E" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {gridDates.map((d) => {
              const iso = toIsoDate(d);
              const inViewedMonth = d.getMonth() === viewedMonth.getMonth();
              const isSelected = iso === selectedDate;
              const isToday = iso === todayIso;
              const hasSessions = markedDates?.has(iso) ?? false;

              return (
                <TouchableOpacity
                  key={iso}
                  style={styles.dayCell}
                  disabled={!inViewedMonth}
                  onPress={() => {
                    onSelectDate(iso);
                    onClose();
                  }}
                >
                  <View style={[
                    styles.dayBubble,
                    isSelected && styles.selectedDayBubble,
                    !isSelected && isToday && styles.todayDayBubble,
                  ]}>
                    <Text style={[
                      styles.dayNumber,
                      !inViewedMonth && styles.dayNumberOutsideMonth,
                      isSelected && styles.selectedDayNumber,
                      !isSelected && isToday && styles.todayDayNumber,
                    ]}>
                      {d.getDate()}
                    </Text>
                  </View>
                  {hasSessions && <View style={[styles.dot, isSelected && styles.dotOnSelected]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDayBubble: {
    backgroundColor: '#1C1C1E',
  },
  todayDayBubble: {
    borderWidth: 1.5,
    borderColor: '#1C1C1E',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  dayNumberOutsideMonth: {
    color: '#D1D1D6',
  },
  selectedDayNumber: {
    color: '#FFF',
    fontWeight: '700',
  },
  todayDayNumber: {
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1C1C1E',
    marginTop: 2,
  },
  dotOnSelected: {
    backgroundColor: '#1C1C1E',
  },
});
