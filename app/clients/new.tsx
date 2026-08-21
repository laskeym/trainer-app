// app/clients/new.tsx
import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // Optimized context package import
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { createClient } from '../../lib/queries/clients'; // Clean abstracted backend query layout

export default function AddClientScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ 
    name: '', 
    height: '', 
    target: '', 
    constraints: '' 
  });

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Required Field', 'Please enter the client full name.');
      return;
    }

    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error(userError?.message || 'Authenticated trainer session not found.');
      }

      const parsedHeight = form.height.trim() ? parseFloat(form.height) : null;

      // Call our clean external query function directly
      const { error: insertError } = await createClient({
        trainerId: user.id,
        name: form.name.trim(),
        height: isNaN(parsedHeight as number) ? null : parsedHeight,
        fitnessGoals: form.target.trim() || null,
        medicalConstraints: form.constraints.trim() || 'None',
      });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Client profile successfully logged!', [
        { text: 'OK', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error('❌ Failed to mutate client record row:', error.message);
      Alert.alert('Database Mutation Failed', error.message || 'An unexpected server issue occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation App Header */}
      <View style={styles.navBar}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
          disabled={loading}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>New Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        {/* Attribute Block: Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>CLIENT FULL NAME *</Text>
          <TextInput
            placeholder="John Doe"
            placeholderTextColor="#C7C7CC"
            style={styles.inputField}
            value={form.name}
            onChangeText={(v) => setForm(p => ({ ...p, name: v }))}
            editable={!loading}
          />
        </View>

        {/* Attribute Block: Static Height Profile Attribute */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>HEIGHT (CM)</Text>
          <TextInput
            placeholder="182"
            placeholderTextColor="#C7C7CC"
            keyboardType="numeric"
            style={styles.inputField}
            value={form.height}
            onChangeText={(v) => setForm(p => ({ ...p, height: v }))}
            editable={!loading}
          />
        </View>

        {/* Attribute Block: Main Focus Goal */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>FITNESS GOAL OR FOCUS</Text>
          <TextInput
            placeholder="Weight loss, Strength training..."
            placeholderTextColor="#C7C7CC"
            style={styles.inputField}
            value={form.target}
            onChangeText={(v) => setForm(p => ({ ...p, target: v }))}
            editable={!loading}
          />
        </View>

        {/* Attribute Block: Pre-existing Conditions */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>MEDICAL OR PHYSICAL CONSTRAINTS</Text>
          <TextInput
            placeholder="Sciatica history, shoulder instability..."
            placeholderTextColor="#C7C7CC"
            multiline
            numberOfLines={3}
            style={[styles.inputField, styles.textArea]}
            value={form.constraints}
            onChangeText={(v) => setForm(p => ({ ...p, constraints: v }))}
            editable={!loading}
          />
        </View>

        {/* Submit Save Button */}
        <TouchableOpacity 
          style={[styles.submitButton, loading && styles.disabledButton]} 
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Create Client Profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
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
});
