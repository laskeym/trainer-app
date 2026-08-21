import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const MOCK_CLIENTS = [
  { id: 'c1', name: 'Paul Jones', sessionsLeft: 2, constraint: 'Knee injury rehabilitation', goals: 'Hypertrophy' },
  { id: 'c2', name: 'Therse Spring', sessionsLeft: 5, constraint: 'None', goals: 'Mobility & Splits' },
  { id: 'c3', name: 'Sarah Jenkins', sessionsLeft: 11, constraint: 'Lower back tightness', goals: 'Cardio stamina' },
];

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const filteredClients = MOCK_CLIENTS.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Profile Title */}
      <View style={styles.header}>
        <View>
          <Text style={styles.metaLabel}>MANAGEMENT</Text>
          <Text style={styles.screenTitle}>My Clients</Text>
        </View>
      </View>

      {/* Modern High-Contrast Search Block */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          placeholder="Search by client name..."
          placeholderTextColor="#8E8E93"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Main Content Feed */}
      <FlatList
        data={filteredClients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => router.push(`/clients/${item.id}`)}
          >
            <View style={styles.clientCard}>
              <View style={styles.cardHeader}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={styles.clientName}>{item.name}</Text>
                    <Text style={styles.clientGoals}>{item.goals}</Text>
                  </View>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{item.sessionsLeft} left</Text>
                </View>
              </View>

              {/* Collateral Attributes Matrix Row */}
              <View style={styles.constraintBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#AEAEE2" />
                <Text style={styles.constraintText} numberOfLines={1}>
                  {item.constraint}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Floating Action Button (FAB) Dock */}
      <TouchableOpacity 
        style={styles.fabButton}
        onPress={() => router.push('/clients/new')}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.fabText}>Add Client</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9FB',
  },
  header: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  metaLabel: {
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E5EA',
    marginHorizontal: 24,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 20,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 15,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100, // Provides clearance for FAB block anchors
  },
  clientCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  clientGoals: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  constraintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
  },
  constraintText: {
    fontSize: 12,
    color: '#48484A',
    flex: 1,
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  fabText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
