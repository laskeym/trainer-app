// app/templates/new.tsx
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { createDayTypeTemplate } from '../../lib/queries/templates';

export default function AddTemplateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter a name for this template.');
      return;
    }

    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message || 'Authenticated trainer session not found.');
      }

      const { data, error: insertError } = await createDayTypeTemplate({
        trainerId: user.id,
        name: name.trim(),
      });

      if (insertError) throw insertError;

      // Straight into the exercise editor — a template with no exercises
      // yet isn't useful on its own (SCRUM-25 builds that screen), so
      // replace rather than push: going "back" from the editor should
      // return to the template list, not to this now-done create screen.
      router.replace(`/templates/${data.id}`);

    } catch (error: any) {
      console.error('❌ Failed to create template:', error.message);
      Alert.alert('Creation Failed', error.message || 'An unexpected server issue occurred.');
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
        <Text style={styles.navTitle}>New Template</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>TEMPLATE NAME *</Text>
          <TextInput
            placeholder="Leg Day"
            placeholderTextColor="#C7C7CC"
            style={styles.inputField}
            value={name}
            onChangeText={setName}
            editable={!loading}
            autoFocus
          />
        </View>

        <Text style={styles.helperText}>
          You'll add exercises to this template on the next screen.
        </Text>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
          testID="new-template-submit"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Create Template</Text>
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
    gap: 12,
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
  helperText: {
    fontSize: 13,
    color: '#8E8E93',
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
