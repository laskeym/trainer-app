import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Domain-specific training session data model
const SCHEDULED_SESSIONS = [
  {
    id: 's1',
    clientName: 'Paul Jones',
    timeSlot: '09:00 AM - 10:00 AM',
    workoutType: 'Leg Day',
    sessionCountText: '2 sessions left',
    locationTag: 'Beverly Hills Gym',
    gradientColors: ['#3A1C71', '#D76D77'], // Deep Coral Purple
  },
  {
    id: 's2',
    clientName: 'Therse Spring',
    timeSlot: '10:30 AM - 11:30 AM',
    workoutType: 'Arm & Back',
    sessionCountText: '5 sessions left',
    locationTag: 'Virtual / Zoom',
    gradientColors: ['#1f4037', '#99f2c8'], // Emerald Sea
  },
  {
    id: 's3',
    clientName: 'Sarah Jenkins',
    timeSlot: '02:00 PM - 03:00 PM',
    workoutType: 'Upper Body',
    sessionCountText: '11 sessions left',
    locationTag: 'Main Gym Floor',
    gradientColors: ['#1e3c72', '#2a5298'], // Premium Royal Blue
  },
  {
    id: 's4',
    clientName: 'Michael Chang',
    timeSlot: '04:30 PM - 05:15 PM',
    workoutType: 'Cardio & HIIT',
    sessionCountText: 'New Client',
    locationTag: 'Zone 3 Turf',
    gradientColors: ['#e65c00', '#F9D423'], // Electric Sunset
  }
];

const DAYS_OF_WEEK = [
  { id: 'd1', day: 'Mon', date: '16' },
  { id: 'd2', day: 'Tue', date: '17' },
  { id: 'd3', day: 'Wed', date: '18' },
  { id: 'd4', day: 'Thu', date: '19' },
  { id: 'd5', day: 'Fri', date: '20' },
  { id: 'd6', day: 'Sat', date: '21' },
  { id: 'd7', day: 'Sun', date: '22' },
];

export default function TrainerDashboard() {
  const [selectedDate, setSelectedDate] = useState('18'); // Default view state

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Meta Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.monthLabel}>SEPTEMBER 2025</Text>
          <Text style={styles.screenTitle}>Gym Schedule</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={20} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#111" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Synchronized Weekly Calendar Strip */}
      <View style={styles.calendarStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {DAYS_OF_WEEK.map((item) => {
            const isSelected = item.date === selectedDate;
            return (
              <TouchableOpacity 
                key={item.id} 
                style={[styles.dateBubble, isSelected && styles.selectedDateBubble]}
                onPress={() => setSelectedDate(item.date)}
              >
                <Text style={[styles.dayLabel, isSelected && styles.selectedText]}>{item.day}</Text>
                <Text style={[styles.dateLabel, isSelected && styles.selectedText]}>{item.date}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Scheduled Sessions FlatList using Gradient Cards */}
      <FlatList
        data={SCHEDULED_SESSIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.9} style={styles.cardWrapper}>
            <LinearGradient
              colors={item.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              {/* NEW Top Section: Client Avatar, Name, and Time Slot */}
              <View style={styles.cardRow}>
                <View style={styles.clientMetaHeader}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{item.clientName.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={styles.clientNameHeaderLabel}>{item.clientName}</Text>
                    <Text style={styles.timeSlotLabel}>{item.timeSlot}</Text>
                  </View>
                </View>
                <View style={styles.actionPill}>
                  <Ionicons name="play" size={12} color="#FFF" />
                </View>
              </View>

              {/* NEW Lower Section: Workout Target, Location, and Sessions Remaining */}
              <View style={styles.cardFooter}>
                <View>
                  <Text style={styles.workoutTypeLabel}>{item.workoutType}</Text>
                  <View style={styles.locationMeta}>
                    <Ionicons name="location" size={12} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.locationText}>{item.locationTag}</Text>
                  </View>
                </View>
                
                <View style={styles.packageBadge}>
                  <Text style={styles.packageText}>{item.sessionCountText}</Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
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
});
