import React, { useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, TextInput, TouchableOpacity,
  Alert, SafeAreaView, KeyboardAvoidingView, Platform, Modal,
  ScrollView, Share,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

function Avatar({ name, size = 48 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.33 }]}>{initials}</Text>
    </View>
  );
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadContacts(query = '') {
    setLoading(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : '';
      const res = await client.get(`/ghl/contacts${params}`);
      setContacts(res.data.contacts || []);
    } catch (err) {
      const d = err?.response?.data;
      const msg = typeof d === 'string' ? d : (d ? JSON.stringify(d) : err?.message) || 'Failed';
      Alert.alert('Error ' + (err?.response?.status || ''), msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadContacts(); }, []);

  useEffect(() => {
    const t = setTimeout(() => loadContacts(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  async function openContact(item) {
    setSelected({ ...item, _loading: true });
    setDetailLoading(true);
    try {
      const res = await client.get(`/ghl/contacts/${item.id}`);
      const c = res.data.contact || res.data;
      setSelected({ ...item, ...c, _loading: false });
    } catch {
      setSelected({ ...item, _loading: false });
    } finally {
      setDetailLoading(false);
    }
  }

  async function addContact() {
    if (!newFirst && !newPhone) {
      Alert.alert('Missing info', 'Enter at least a first name or phone number.');
      return;
    }
    setSaving(true);
    try {
      await client.post('/ghl/contacts', {
        firstName: newFirst, lastName: newLast,
        phone: newPhone, email: newEmail,
      });
      setShowAdd(false);
      setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail('');
      loadContacts(search);
    } catch {
      Alert.alert('Error', 'Could not create contact.');
    } finally {
      setSaving(false);
    }
  }

  function renderContact({ item }) {
    const name = [item.firstName, item.lastName].filter(Boolean).join(' ') || 'No name';
    return (
      <TouchableOpacity style={styles.row} onPress={() => openContact(item)}>
        <Avatar name={name} />
        <View style={styles.rowContent}>
          <Text style={styles.contactName}>{name}</Text>
          {item.phone && <Text style={styles.contactDetail}>{item.phone}</Text>}
          {item.email && <Text style={styles.contactDetail}>{item.email}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
      </TouchableOpacity>
    );
  }

  const selectedName = selected
    ? [selected.firstName, selected.lastName].filter(Boolean).join(' ') || 'Contact'
    : '';

  const selectedAddress = selected
    ? [selected.address1, selected.city, selected.state, selected.postalCode].filter(Boolean).join(', ')
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, phone, email..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          renderItem={renderContact}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No contacts found</Text>
            </View>
          }
        />
      )}

      {/* Contact Detail Modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contact Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <ActivityIndicator color="#4F46E5" style={{ marginVertical: 30 }} />
            ) : selected ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailTop}>
                  <Avatar name={selectedName} size={64} />
                  <Text style={styles.detailName}>{selectedName}</Text>
                  {selected.tags?.length > 0 && (
                    <Text style={styles.detailTags}>{selected.tags.join(' · ')}</Text>
                  )}
                </View>

                {selected.phone ? (
                  <InfoRow icon="call-outline" label="Phone" value={selected.phone}
                    onCopy={() => Share.share({ message: selected.phone })} />
                ) : null}
                {selected.email ? (
                  <InfoRow icon="mail-outline" label="Email" value={selected.email}
                    onCopy={() => Share.share({ message: selected.email })} />
                ) : null}
                {selectedAddress ? (
                  <InfoRow icon="location-outline" label="Address" value={selectedAddress}
                    onCopy={() => Share.share({ message: selectedAddress })} />
                ) : null}
                {selected.source ? (
                  <InfoRow icon="git-branch-outline" label="Source" value={selected.source} />
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Add Contact Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Contact</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Field placeholder="First name" value={newFirst} onChangeText={setNewFirst} />
              <Field placeholder="Last name" value={newLast} onChangeText={setNewLast} />
              <Field placeholder="Phone number" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <Field placeholder="Email address" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
            </ScrollView>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={addContact}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Contact</Text>
              }
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, onCopy }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      {onCopy ? (
        <TouchableOpacity onPress={onCopy} style={styles.copyBtn}>
          <Ionicons name="copy-outline" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Field({ placeholder, value, onChangeText, keyboardType, autoCapitalize }) {
  return (
    <TextInput
      style={styles.field}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, paddingHorizontal: 14, height: 44,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
  },
  separator: { height: 1, backgroundColor: '#F2F2F7', marginLeft: 76 },
  avatar: { backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  rowContent: { flex: 1, marginLeft: 12 },
  contactName: { fontSize: 16, fontWeight: '500', color: '#000' },
  contactDetail: { fontSize: 13, color: '#6B7280', marginTop: 1 },

  emptyBox: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },

  detailTop: { alignItems: 'center', paddingVertical: 20 },
  detailName: { fontSize: 20, fontWeight: '700', color: '#000', marginTop: 12 },
  detailTags: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', fontWeight: '600' },
  infoValue: { fontSize: 15, color: '#000', marginTop: 1 },
  copyBtn: { padding: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  field: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#000', marginBottom: 10,
  },
  saveBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
