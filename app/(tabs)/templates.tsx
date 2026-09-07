// app/(tabs)/templates.tsx
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getDayTypeTemplatesWithExerciseCounts } from '../../lib/queries/templates';

export default function TemplatesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);

  // useFocusEffect (not a plain useEffect) so this refetches every time the
  // tab regains focus — including after creating a template or adding
  // exercises to one and navigating back. Same pattern as clients.tsx and
  // the dashboard.
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function fetchTemplates() {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data, error } = await getDayTypeTemplatesWithExerciseCounts(user.id);
          if (error) throw error;

          if (isMounted) setTemplates(data || []);
        } catch (err) {
          console.error('❌ Failed loading template list:', err);
        } finally {
          if (isMounted) setLoading(false);
        }
      }

      fetchTemplates();
      return () => { isMounted = false; };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.metaLabel}>WORKOUT LIBRARY</Text>
          <Text style={styles.screenTitle}>Templates</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#1C1C1E" />
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No templates yet. Add one below!</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.templateCard}
              onPress={() => router.push(`/templates/${item.id}`)}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="barbell-outline" size={20} color="#FFF" />
              </View>
              <View style={styles.templateMetaText}>
                <Text style={styles.templateName}>{item.name}</Text>
                <Text style={styles.exerciseCountText}>
                  {item.exerciseCount === 1 ? '1 exercise' : `${item.exerciseCount} exercises`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fabButton}
        onPress={() => router.push('/templates/new')}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.fabText}>Add Template</Text>
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
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
  },
  templateCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateMetaText: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  exerciseCountText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
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
