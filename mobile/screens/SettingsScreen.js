import React, { useState } from 'react';
import {
  View, StyleSheet, Alert, TouchableOpacity,
  SafeAreaView, TextInput, ScrollView,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [newKey, setNewKey] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    try {
      const res = await client.get('/ghl/test');
      const d = res.data;
      if (d.success) {
        Alert.alert('Connected!', `Location ID: ${d.locationId}\nKey length: ${d.keyLength} chars\nLocation: ${d.locationName}`);
      } else {
        Alert.alert('Connection Failed', `Location ID: ${d.locationId}\nKey length: ${d.keyLength} chars\nGHL status: ${d.ghlStatus}\nError: ${JSON.stringify(d.ghlError)}`);
      }
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || err.message);
    } finally {
      setTesting(false);
    }
  }

  async function updateGhlKey() {
    if (!newKey.trim() && !newLocationId.trim()) {
      Alert.alert('Missing fields', 'Enter a new API key, a Location ID, or both.');
      return;
    }
    setSaving(true);
    try {
      const body = {};
      if (newKey.trim()) body.ghlKey = newKey.trim();
      if (newLocationId.trim()) body.locationId = newLocationId.trim();
      await client.post('/auth/ghl-key', body);
      Alert.alert('Saved', 'Your GHL credentials have been updated.');
      setNewKey('');
      setNewLocationId('');
      setShowKeyForm(false);
    } catch {
      Alert.alert('Error', 'Could not update. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="person" size={18} color="#4F46E5" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* GHL Section */}
        <Text style={styles.sectionLabel}>GoHighLevel</Text>
        <View style={styles.group}>
          <View style={[styles.row, showKeyForm && { borderBottomWidth: 0 }]}>
            <View style={[styles.iconBox, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="key" size={18} color="#059669" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>API Key</Text>
              <Text style={styles.rowValue}>Stored encrypted</Text>
            </View>
            <TouchableOpacity onPress={() => setShowKeyForm(v => !v)}>
              <Text style={styles.rowAction}>{showKeyForm ? 'Cancel' : 'Update'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.row} onPress={testConnection} disabled={testing}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="wifi" size={18} color="#3B82F6" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Test Connection</Text>
              <Text style={styles.rowValue}>Check if GHL key + location ID work</Text>
            </View>
            {testing
              ? <ActivityIndicator size="small" color="#3B82F6" />
              : <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            }
          </TouchableOpacity>

          {showKeyForm && (
            <View style={styles.keyForm}>
              <TextInput
                style={styles.keyInput}
                placeholder="Paste new GHL API Key (pit-...)"
                placeholderTextColor="#9CA3AF"
                value={newKey}
                onChangeText={setNewKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TextInput
                style={styles.keyInput}
                placeholder="Location ID (e.g. ZPL1eulX1pNHJrf5Zji0)"
                placeholderTextColor="#9CA3AF"
                value={newLocationId}
                onChangeText={setNewLocationId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, saving && { opacity: 0.6 }]}
                onPress={updateGhlKey}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveKeyBtnText}>Save Credentials</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* App Section */}
        <Text style={styles.sectionLabel}>App</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: '#F3F4F6' }]}>
              <Ionicons name="information-circle" size={18} color="#6B7280" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 20, marginTop: 24, marginBottom: 8,
  },
  group: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, color: '#000', fontWeight: '500' },
  rowValue: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  rowAction: { fontSize: 14, color: '#4F46E5', fontWeight: '500' },

  keyForm: { paddingHorizontal: 16, paddingBottom: 16 },
  keyInput: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#000', marginBottom: 10,
  },
  saveKeyBtn: {
    backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center',
  },
  saveKeyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 24, marginBottom: 40,
    borderRadius: 16, paddingVertical: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#DC2626' },
});
