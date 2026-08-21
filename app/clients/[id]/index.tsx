// app/clients/[id]/index.tsx
import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientDetailsWithHistory } from '../../../lib/queries/clients';

export default function ClientProfileDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function fetchFullProfile() {
        try {
          const { data, error } = await getClientDetailsWithHistory(id as string);
          if (error) throw error;
          if (isMounted) setProfile(data);
        } catch (err) {
          console.error('❌ Error fetching profile history dataset:', err);
        } finally {
          if (isMounted) setLoading(false);
        }
      }

      fetchFullProfile();
      return () => { isMounted = false; };
    }, [id])
  );

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.centerLoader}>
        <ActivityIndicator size="large" color="#1C1C1E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Custom Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Client Profile</Text>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="create-outline" size={22} color="#1C1C1E" />
        </TouchableOpacity>
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
            <TouchableOpacity style={styles.addMetricTextButton}>
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
                <View>
                  <Text style={styles.metricDateText}>
                    {new Date(metric.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
});
