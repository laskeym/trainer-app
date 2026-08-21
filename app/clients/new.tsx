import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AddClientScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', target: '', constraints: '', accountSessions: '10' });

  const handleSave = () => {
    // This input model will map cleanly into your client table insertion test cases next
    console.log('Inserting payload structure into Supabase target:', form);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation App Header */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>New Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        {/* Attribute Block: Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>CLIENT FULL NAME</Text>
          <TextInput
            placeholder="John Doe"
            placeholderTextColor="#AEAEE2"
            style={styles.inputField}
            value={form.name}
            onChangeText={(v) => setForm(p => ({ ...p, name: v }))}
          />
        </View>

        {/* Attribute Block: Main Focus Goal */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>FITNESS GOAL OR FOCUS</Text>
          <TextInput
            placeholder="Weight loss, Strength training..."
            placeholderTextColor="#AEAEE2"
            style={styles.inputField}
            value={form.target}
            onChangeText={(v) => setForm(p => ({ ...p, target: v }))}
          />
        </View>

        {/* Attribute Block: Pre-existing Conditions */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>MEDICAL OR PHYSICAL CONSTRAINTS</Text>
          <TextInput
            placeholder="Sciatica history, shoulder instability..."
            placeholderTextColor="#AEAEE2"
            multiline
            numberOfLines={3}
            style={[styles.inputField, styles.textArea]}
            value={form.constraints}
            onChangeText={(v) => setForm(p => ({ ...p, constraints: v }))}
          />
        </View>

        {/* Attribute Block: Package Allocation Count */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>PRE-PAID SESSION BALANCE</Text>
          <TextInput
            keyboardType="number-pad"
            style={styles.inputField}
            value={form.accountSessions}
            onChangeText={(v) => setForm(p => ({ ...p, accountSessions: v }))}
          />
        </View>

        {/* Submit Save Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSave}>
          <Text style={styles.submitButtonText}>Create Client Profile</Text>
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
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
