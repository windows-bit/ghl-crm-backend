import React, { useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, Alert, TouchableOpacity,
  SafeAreaView, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../api/client';

const STATUS_COLOR = { paid: '#059669', sent: '#D97706', draft: '#6B7280' };
const STATUS_BG   = { paid: '#D1FAE5', sent: '#FEF3C7', draft: '#F3F4F6' };

const DURATIONS = [
  { label: '30 min', hours: 0.5 },
  { label: '1 hour', hours: 1 },
  { label: '1.5 hrs', hours: 1.5 },
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
  { label: '4 hours', hours: 4 },
];

function fmt12(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InvoicesScreen({ route }) {
  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(null);
  const [showForm, setShowForm]   = useState(route?.params?.openForm === true);

  // New invoice form
  const [contactId, setContactId]     = useState('');
  const [invoiceName, setInvoiceName] = useState('');
  const [itemName, setItemName]       = useState('');
  const [qty, setQty]                 = useState('1');
  const [unitPrice, setUnitPrice]     = useState('');
  const [saving, setSaving]           = useState(false);

  // Schedule job state
  const [scheduleInv, setScheduleInv]   = useState(null); // the invoice being scheduled
  const [calendars, setCalendars]       = useState([]);
  const [calLoading, setCalLoading]     = useState(false);
  const [selCal, setSelCal]             = useState(null);
  const [jobDate, setJobDate]           = useState(new Date());
  const [jobTime, setJobTime]           = useState(() => { const d = new Date(); d.setMinutes(0,0,0); return d; });
  const [duration, setDuration]         = useState(1);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduling, setScheduling]     = useState(false);

  useEffect(() => { loadInvoices(); }, []);

  async function loadInvoices() {
    try {
      const res = await client.get('/ghl/invoices');
      setInvoices(res.data.invoices || []);
    } catch {
      Alert.alert('Error', 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }

  async function createInvoice() {
    if (!contactId.trim() || !invoiceName.trim() || !itemName || !unitPrice) {
      Alert.alert('Missing fields', 'Fill in all fields before saving.');
      return;
    }
    setSaving(true);
    try {
      await client.post('/ghl/invoices', {
        contactId: contactId.trim(),
        name: invoiceName.trim(),
        lineItems: [{ name: itemName, qty: parseFloat(qty) || 1, unitPrice: parseFloat(unitPrice) || 0 }],
      });
      setShowForm(false);
      setContactId(''); setInvoiceName(''); setItemName(''); setQty('1'); setUnitPrice('');
      await loadInvoices();
    } catch {
      Alert.alert('Error', 'Could not create invoice.');
    } finally {
      setSaving(false);
    }
  }

  async function sendInvoice(id) {
    setSending(id);
    try {
      await client.post(`/ghl/invoices/${id}/send`);
      Alert.alert('Sent!', 'Invoice sent to contact.');
    } catch {
      Alert.alert('Error', 'Could not send invoice.');
    } finally {
      setSending(null);
    }
  }

  async function openSchedule(inv) {
    setScheduleInv(inv);
    setSelCal(null);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    setJobDate(new Date());
    setJobTime(now);
    setDuration(1);
    setCalLoading(true);
    try {
      const res = await client.get('/ghl/calendars');
      const cals = res.data.calendars || [];
      setCalendars(cals);
      // Auto-select Jobs calendar if found
      const jobsCal = cals.find(c => c.name?.toLowerCase().includes('job'));
      setSelCal(jobsCal || cals[0] || null);
    } catch {
      Alert.alert('Error', 'Could not load calendars.');
    } finally {
      setCalLoading(false);
    }
  }

  async function scheduleJob() {
    if (!selCal) { Alert.alert('Select a calendar', 'Choose which calendar to add this job to.'); return; }
    if (!scheduleInv?.contactId) { Alert.alert('No contact', 'This invoice has no contact linked.'); return; }

    setScheduling(true);
    try {
      // Combine date + time into one datetime
      const start = new Date(jobDate);
      start.setHours(jobTime.getHours(), jobTime.getMinutes(), 0, 0);
      const end = new Date(start.getTime() + duration * 3600000);

      await client.post('/ghl/appointments', {
        calendarId: selCal.id,
        contactId: scheduleInv.contactId,
        title: scheduleInv.name || 'Job',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      setScheduleInv(null);
      Alert.alert('Scheduled!', `"${scheduleInv.name}" added to ${selCal.name} on ${fmtDate(start)} at ${fmt12(start)}.`);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      Alert.alert('Error', `Could not schedule job: ${msg}`);
    } finally {
      setScheduling(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Invoices</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No invoices yet</Text>
              <Text style={styles.emptyText}>Tap + to create your first invoice</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = item.status || 'draft';
            const color  = STATUS_COLOR[status] || '#6B7280';
            const bg     = STATUS_BG[status]    || '#F3F4F6';
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.invoiceName} numberOfLines={1}>{item.name || 'Invoice'}</Text>
                  <View style={[styles.statusPill, { backgroundColor: bg }]}>
                    <Text style={[styles.statusText, { color }]}>{status.toUpperCase()}</Text>
                  </View>
                </View>
                {item.total > 0 && (
                  <Text style={styles.amount}>${item.total?.toLocaleString()}</Text>
                )}
                {item.contactName ? (
                  <View style={styles.contactRow}>
                    <Ionicons name="person-outline" size={13} color="#9CA3AF" style={{ marginRight: 4 }} />
                    <Text style={styles.contactText}>{item.contactName}</Text>
                  </View>
                ) : null}

                <View style={styles.btnRow}>
                  {status !== 'paid' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.sendBtn, sending === item.id && { opacity: 0.6 }]}
                      onPress={() => sendInvoice(item.id)}
                      disabled={!!sending}
                    >
                      {sending === item.id
                        ? <ActivityIndicator color="#4F46E5" size="small" />
                        : (
                          <>
                            <Ionicons name="send-outline" size={14} color="#4F46E5" style={{ marginRight: 5 }} />
                            <Text style={styles.sendBtnText}>Send</Text>
                          </>
                        )
                      }
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.scheduleBtn]}
                    onPress={() => openSchedule(item)}
                  >
                    <Ionicons name="calendar-outline" size={14} color="#059669" style={{ marginRight: 5 }} />
                    <Text style={styles.scheduleBtnText}>Schedule Job</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── Schedule Job Modal ── */}
      <Modal visible={!!scheduleInv} animationType="slide" transparent onRequestClose={() => setScheduleInv(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule as Job</Text>
              <TouchableOpacity onPress={() => setScheduleInv(null)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Invoice summary */}
              <View style={styles.invSummary}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invSummaryName}>{scheduleInv?.name || 'Invoice'}</Text>
                  {scheduleInv?.contactName ? (
                    <Text style={styles.invSummaryContact}>{scheduleInv.contactName}</Text>
                  ) : null}
                </View>
                {scheduleInv?.total > 0 && (
                  <Text style={styles.invSummaryAmt}>${scheduleInv.total?.toLocaleString()}</Text>
                )}
              </View>

              {/* Calendar picker */}
              <Text style={styles.fieldLabel}>Calendar</Text>
              {calLoading ? (
                <ActivityIndicator color="#4F46E5" style={{ marginVertical: 12 }} />
              ) : (
                calendars.map(cal => (
                  <TouchableOpacity
                    key={cal.id}
                    style={[styles.calRow, selCal?.id === cal.id && styles.calRowSel]}
                    onPress={() => setSelCal(cal)}
                  >
                    <View style={[styles.calDot, { backgroundColor: cal.eventColor || '#4F46E5' }]} />
                    <Text style={[styles.calName, selCal?.id === cal.id && { color: '#4F46E5', fontWeight: '700' }]}>
                      {cal.name}
                    </Text>
                    {selCal?.id === cal.id && (
                      <Ionicons name="checkmark-circle" size={18} color="#4F46E5" style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                ))
              )}

              {/* Date */}
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.pickerBtnText}>{fmtDate(jobDate)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={jobDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, d) => { setShowDatePicker(false); if (d) setJobDate(d); }}
                />
              )}

              {/* Time */}
              <Text style={styles.fieldLabel}>Start Time</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={16} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.pickerBtnText}>{fmt12(jobTime)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={jobTime}
                  mode="time"
                  display="spinner"
                  minuteInterval={15}
                  onChange={(_, d) => { setShowTimePicker(false); if (d) setJobTime(d); }}
                />
              )}

              {/* Duration */}
              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durRow}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d.hours}
                    style={[styles.durChip, duration === d.hours && styles.durChipSel]}
                    onPress={() => setDuration(d.hours)}
                  >
                    <Text style={[styles.durChipTxt, duration === d.hours && styles.durChipTxtSel]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, scheduling && { opacity: 0.6 }]}
              onPress={scheduleJob}
              disabled={scheduling}
            >
              {scheduling
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Ionicons name="calendar" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.saveBtnText}>Schedule Job</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── New Invoice Modal ── */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Invoice</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Contact ID</Text>
              <TextInput
                style={styles.field}
                placeholder="GHL Contact ID"
                placeholderTextColor="#9CA3AF"
                value={contactId}
                onChangeText={setContactId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldLabel}>Invoice Name</Text>
              <TextInput
                style={styles.field}
                placeholder="e.g. Window Cleaning — March"
                placeholderTextColor="#9CA3AF"
                value={invoiceName}
                onChangeText={setInvoiceName}
              />
              <Text style={styles.fieldLabel}>Line Item</Text>
              <TextInput
                style={styles.field}
                placeholder="Description"
                placeholderTextColor="#9CA3AF"
                value={itemName}
                onChangeText={setItemName}
              />
              <View style={styles.twoCol}>
                <TextInput
                  style={[styles.field, { flex: 1, marginRight: 8 }]}
                  placeholder="Qty"
                  placeholderTextColor="#9CA3AF"
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.field, { flex: 2 }]}
                  placeholder="Unit Price ($)"
                  placeholderTextColor="#9CA3AF"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  keyboardType="numeric"
                />
              </View>
              {unitPrice ? (
                <Text style={styles.total}>
                  Total: ${(parseFloat(qty || 1) * parseFloat(unitPrice || 0)).toFixed(2)}
                </Text>
              ) : null}
            </ScrollView>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={createInvoice}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Create Invoice</Text>
              }
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  invoiceName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#000', marginRight: 8 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  amount: { fontSize: 22, fontWeight: '700', color: '#059669', marginBottom: 6 },
  contactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  contactText: { fontSize: 13, color: '#6B7280' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 9,
  },
  sendBtn: { borderWidth: 1, borderColor: '#4F46E5' },
  sendBtnText: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },
  scheduleBtn: { borderWidth: 1, borderColor: '#059669' },
  scheduleBtnText: { fontSize: 13, color: '#059669', fontWeight: '600' },

  emptyBox: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  // Shared modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '92%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', marginBottom: 6, marginTop: 14,
  },
  field: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#000',
  },
  twoCol: { flexDirection: 'row', marginTop: 4 },
  total: { fontSize: 16, fontWeight: '700', color: '#059669', marginTop: 10 },
  saveBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Schedule modal specific
  invSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F7FF', borderRadius: 14, padding: 14, marginBottom: 4,
  },
  invSummaryName: { fontSize: 15, fontWeight: '700', color: '#000' },
  invSummaryContact: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  invSummaryAmt: { fontSize: 20, fontWeight: '700', color: '#059669', marginLeft: 8 },

  calRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA',
    marginBottom: 6, backgroundColor: '#fff',
  },
  calRowSel: { borderColor: '#4F46E5', backgroundColor: '#F8F7FF' },
  calDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  calName: { fontSize: 15, color: '#374151', fontWeight: '500' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14,
  },
  pickerBtnText: { fontSize: 15, color: '#000' },

  durRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#fff',
  },
  durChipSel: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  durChipTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },
  durChipTxtSel: { color: '#fff', fontWeight: '700' },
});
