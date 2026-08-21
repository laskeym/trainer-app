// app/(tabs)/clients.tsx
import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { client } from '../../lib/supabase'; 
import { getClientsForTrainer } from '../../lib/queries/clients';

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);

  // Automatically refresh directories whenever this tab panel comes into active user view focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function fetchClientDirectory() {
        try {
          const { data: { user } } = await client.auth.getUser();
          if (!user) return;

          const { data, error } = await getClientsForTrainer(user.id);
          if (error) throw error;

          if (isMounted) setClients(data || []);
        } catch (err) {
          console.error('❌ Failed loading client data collection feed:', err);
        } finally {
          if (isMounted) setLoading(false);
        }
      }

      fetchClientDirectory();
      return () => { isMounted = false; };
    }, [])
  );

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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

      {/* Core Loader Guard Clause Block */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#1C1C1E" />
        </View>
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No clients found. Add one below!</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              activeOpacity={0.8} 
              style={styles.clientCard}
              onPress={() => router.push(`/clients/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.clientMetaText}>
                    <Text style={styles.clientName}>{item.name}</Text>
                    <Text style={styles.clientGoals} numberOfLines={1}>{item.goals}</Text>
                  </View>
                </View>
                <View style={styles.chevronIcon}>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </View>
              </View>

              {/* Functional Operational Safety Constraint Tag Line */}
              <View style={styles.constraintBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#8E8E93" />
                <Text style={styles.constraintText} numberOfLines={1}>
                  {item.constraint}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Capsule Button Dock Layout */}
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
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100,
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
    flex: 1,
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
  clientMetaText: {
    flex: 1,
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
    maxWidth: '95%',
  },
  chevronIcon: {
    paddingLeft: 8,
  },
  constraintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    marginTop: 14,
  },
  constraintText: {
    fontSize: 12,
    color: '#48484A',
    fontWeight: '500',
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 40,
    fontSize: 15,
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
