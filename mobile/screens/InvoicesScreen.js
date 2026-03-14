import React, { useEffect, useState, useRef } from 'react';
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

// Contact search input with live suggestions
function ContactSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  function search(text) {
    setQuery(text);
    onSelect(null); // clear selection when typing
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await client.get('/ghl/contacts', { params: { search: text, limit: 6 } });
        const contacts = res.data.contacts || [];
        setResults(contacts);
        setOpen(contacts.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function pick(contact) {
    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email || contact.phone || 'Contact';
    setQuery(name);
    setResults([]);
    setOpen(false);
    onSelect({ id: contact.id, name });
  }

  return (
    <View>
      <View style={ss.searchWrap}>
        <TextInput
          style={ss.searchInput}
          placeholder="Search by name..."
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={search}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {searching && <ActivityIndicator size="small" color="#4F46E5" style={ss.searchSpinner} />}
        {value && !searching && <Ionicons name="checkmark-circle" size={18} color="#059669" style={ss.searchSpinner} />}
      </View>
      {open && (
        <View style={ss.dropdown}>
          {results.map(c => {
            const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || 'Contact';
            return (
              <TouchableOpacity key={c.id} style={ss.dropdownRow} onPress={() => pick(c)}>
                <Ionicons name="person-circle-outline" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
                <View>
                  <Text style={ss.dropdownName}>{name}</Text>
                  {c.phone || c.email ? (
                    <Text style={ss.dropdownSub}>{c.phone || c.email}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function InvoicesScreen({ route }) {
  const isEstimate = route?.params?.mode === 'estimate';
  const TITLE      = isEstimate ? 'Estimates' : 'Invoices';
  const FORM_TITLE = isEstimate ? 'New Estimate' : 'New Invoice';
  const BTN_LABEL  = isEstimate ? 'Create Estimate' : 'Create Invoice';

  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(null);
  const [showForm, setShowForm]   = useState(route?.params?.openForm === true);

  // New invoice form
  const [selContact, setSelContact]   = useState(null);  // { id, name }
  const [invoiceName, setInvoiceName] = useState('');
  const [selProduct, setSelProduct]   = useState(null);  // { name, price }
  const [customPrice, setCustomPrice] = useState('');
  const [qty, setQty]                 = useState('1');
  const [products, setProducts]       = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [showProdPicker, setShowProdPicker] = useState(false);

  // Schedule job state
  const [scheduleInv, setScheduleInv]       = useState(null);
  const [calendars, setCalendars]           = useState([]);
  const [calLoading, setCalLoading]         = useState(false);
  const [selCal, setSelCal]                 = useState(null);
  const [jobDate, setJobDate]               = useState(new Date());
  const [jobTime, setJobTime]               = useState(() => { const d = new Date(); d.setMinutes(0,0,0); return d; });
  const [duration, setDuration]             = useState(1);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduling, setScheduling]         = useState(false);

  useEffect(() => { loadInvoices(); }, []);

  async function loadInvoices() {
    try {
      const res = await client.get('/ghl/invoices');
      let all = res.data.invoices || [];
      // Estimates = draft/sent only; Invoices = all
      if (isEstimate) all = all.filter(i => i.status === 'draft' || i.status === 'sent');
      setInvoices(all);
    } catch {
      Alert.alert('Error', 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }

  async function openNewInvoice() {
    setSelContact(null);
    setInvoiceName('');
    setSelProduct(null);
    setQty('1');
    setShowForm(true);
    // Load products
    setProdLoading(true);
    try {
      const res = await client.get('/ghl/products');
      setProducts(res.data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setProdLoading(false);
    }
  }

  async function createInvoice() {
    if (!selContact) { Alert.alert('Missing contact', 'Search and select a contact first.'); return; }
    if (!invoiceName.trim()) { Alert.alert('Missing name', 'Enter an invoice name.'); return; }
    if (!selProduct) { Alert.alert('Missing line item', 'Select a product or service.'); return; }

    setSaving(true);
    try {
      await client.post('/ghl/invoices', {
        contactId: selContact.id,
        name: invoiceName.trim(),
        lineItems: [{ name: selProduct.name, qty: parseFloat(qty) || 1, unitPrice: parseFloat(customPrice) || selProduct.price || 0 }],
      });
      setShowForm(false);
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
    const now = new Date(); now.setMinutes(0,0,0);
    setJobDate(new Date()); setJobTime(now); setDuration(1);
    setCalLoading(true);
    try {
      const res = await client.get('/ghl/calendars');
      const cals = res.data.calendars || [];
      setCalendars(cals);
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
      Alert.alert('Error', `Could not schedule: ${err.response?.data?.error || err.message}`);
    } finally {
      setScheduling(false);
    }
  }

  // Flatten products into selectable line items (handle variants)
  const productItems = products.flatMap(p => {
    if (p.variants?.length) {
      return p.variants.map(v => ({
        id: `${p._id || p.id}-${v._id || v.id}`,
        name: p.variants.length === 1 ? p.name : `${p.name} — ${v.name}`,
        price: v.price ?? p.price ?? 0,
      }));
    }
    return [{ id: p._id || p.id, name: p.name, price: p.price ?? 0 }];
  });

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Text style={st.title}>{TITLE}</Text>
        <TouchableOpacity style={st.addBtn} onPress={openNewInvoice}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={item => item.id}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.emptyBox}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={st.emptyTitle}>No invoices yet</Text>
              <Text style={st.emptyText}>Tap + to create your first invoice</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = item.status || 'draft';
            const color  = STATUS_COLOR[status] || '#6B7280';
            const bg     = STATUS_BG[status]    || '#F3F4F6';
            return (
              <View style={st.card}>
                <View style={st.cardTop}>
                  <Text style={st.invoiceName} numberOfLines={1}>{item.name || 'Invoice'}</Text>
                  <View style={[st.statusPill, { backgroundColor: bg }]}>
                    <Text style={[st.statusText, { color }]}>{status.toUpperCase()}</Text>
                  </View>
                </View>
                {item.total > 0 && <Text style={st.amount}>${item.total?.toLocaleString()}</Text>}
                {item.contactName ? (
                  <View style={st.contactRow}>
                    <Ionicons name="person-outline" size={13} color="#9CA3AF" style={{ marginRight: 4 }} />
                    <Text style={st.contactText}>{item.contactName}</Text>
                  </View>
                ) : null}
                <View style={st.btnRow}>
                  {status !== 'paid' && (
                    <TouchableOpacity
                      style={[st.actionBtn, st.sendBtn, sending === item.id && { opacity: 0.6 }]}
                      onPress={() => sendInvoice(item.id)}
                      disabled={!!sending}
                    >
                      {sending === item.id
                        ? <ActivityIndicator color="#4F46E5" size="small" />
                        : <><Ionicons name="send-outline" size={14} color="#4F46E5" style={{ marginRight: 5 }} /><Text style={st.sendBtnText}>Send</Text></>
                      }
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[st.actionBtn, st.scheduleBtn]} onPress={() => openSchedule(item)}>
                    <Ionicons name="calendar-outline" size={14} color="#059669" style={{ marginRight: 5 }} />
                    <Text style={st.scheduleBtnText}>Schedule Job</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── Schedule Job Modal ── */}
      <Modal visible={!!scheduleInv} animationType="slide" transparent onRequestClose={() => setScheduleInv(null)}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <View style={st.sheetHead}>
              <Text style={st.sheetTitle}>Schedule as Job</Text>
              <TouchableOpacity onPress={() => setScheduleInv(null)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={st.invSummary}>
                <View style={{ flex: 1 }}>
                  <Text style={st.invSummaryName}>{scheduleInv?.name || 'Invoice'}</Text>
                  {scheduleInv?.contactName ? <Text style={st.invSummaryContact}>{scheduleInv.contactName}</Text> : null}
                </View>
                {scheduleInv?.total > 0 && <Text style={st.invSummaryAmt}>${scheduleInv.total?.toLocaleString()}</Text>}
              </View>

              <Text style={st.label}>Calendar</Text>
              {calLoading ? <ActivityIndicator color="#4F46E5" style={{ marginVertical: 12 }} /> : (
                calendars.map(cal => (
                  <TouchableOpacity key={cal.id} style={[st.calRow, selCal?.id === cal.id && st.calRowSel]} onPress={() => setSelCal(cal)}>
                    <View style={[st.calDot, { backgroundColor: cal.eventColor || '#4F46E5' }]} />
                    <Text style={[st.calName, selCal?.id === cal.id && { color: '#4F46E5', fontWeight: '700' }]}>{cal.name}</Text>
                    {selCal?.id === cal.id && <Ionicons name="checkmark-circle" size={18} color="#4F46E5" style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                ))
              )}

              <Text style={st.label}>Date</Text>
              <TouchableOpacity style={st.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={st.pickerBtnText}>{fmtDate(jobDate)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={jobDate} mode="date" display="spinner" minimumDate={new Date()}
                  onChange={(_, d) => { setShowDatePicker(false); if (d) setJobDate(d); }} />
              )}

              <Text style={st.label}>Start Time</Text>
              <TouchableOpacity style={st.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={16} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={st.pickerBtnText}>{fmt12(jobTime)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker value={jobTime} mode="time" display="spinner" minuteInterval={15}
                  onChange={(_, d) => { setShowTimePicker(false); if (d) setJobTime(d); }} />
              )}

              <Text style={st.label}>Duration</Text>
              <View style={st.durRow}>
                {DURATIONS.map(d => (
                  <TouchableOpacity key={d.hours} style={[st.durChip, duration === d.hours && st.durChipSel]} onPress={() => setDuration(d.hours)}>
                    <Text style={[st.durChipTxt, duration === d.hours && st.durChipTxtSel]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={[st.primaryBtn, scheduling && { opacity: 0.6 }]} onPress={scheduleJob} disabled={scheduling}>
              {scheduling ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Ionicons name="calendar" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={st.primaryBtnTxt}>Schedule Job</Text></>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Product Picker Modal ── */}
      <Modal visible={showProdPicker} animationType="slide" transparent onRequestClose={() => setShowProdPicker(false)}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <View style={st.sheetHead}>
              <Text style={st.sheetTitle}>Select Service</Text>
              <TouchableOpacity onPress={() => setShowProdPicker(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {prodLoading ? (
              <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
            ) : productItems.length === 0 ? (
              <View style={st.emptyBox}>
                <Ionicons name="cube-outline" size={40} color="#D1D5DB" />
                <Text style={st.emptyTitle}>No products found</Text>
                <Text style={st.emptyText}>Add products in your GHL account first.</Text>
              </View>
            ) : (
              <FlatList
                data={productItems}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[st.prodRow, selProduct?.id === item.id && st.prodRowSel]}
                    onPress={() => { setSelProduct(item); setCustomPrice(''); setShowProdPicker(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.prodName}>{item.name}</Text>
                    </View>
                    <Text style={st.prodPrice}>${item.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    {selProduct?.id === item.id && <Ionicons name="checkmark-circle" size={18} color="#4F46E5" style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── New Invoice Modal ── */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={st.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheet}>
            <View style={st.sheetHead}>
              <Text style={st.sheetTitle}>{FORM_TITLE}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Contact search */}
              <Text style={st.label}>Client</Text>
              <ContactSearch value={selContact} onSelect={setSelContact} />

              {/* Invoice name */}
              <Text style={st.label}>Invoice Name</Text>
              <TextInput
                style={st.field}
                placeholder="e.g. Window Cleaning — March"
                placeholderTextColor="#9CA3AF"
                value={invoiceName}
                onChangeText={setInvoiceName}
              />

              {/* Product picker */}
              <Text style={st.label}>Service / Product</Text>
              <TouchableOpacity style={st.pickerBtn} onPress={() => setShowProdPicker(true)}>
                {selProduct ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="cube" size={15} color="#4F46E5" style={{ marginRight: 8 }} />
                    <Text style={st.pickerBtnText}>{selProduct.name}</Text>
                    <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
                  </View>
                ) : (
                  <>
                    <Ionicons name="cube-outline" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                    <Text style={[st.pickerBtnText, { color: '#9CA3AF' }]}>Choose a service...</Text>
                  </>
                )}
              </TouchableOpacity>

              {selProduct && (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 0 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.label}>Price ($)</Text>
                      <TextInput
                        style={st.field}
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        value={customPrice}
                        onChangeText={setCustomPrice}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={{ width: 80 }}>
                      <Text style={st.label}>Qty</Text>
                      <TextInput
                        style={st.field}
                        placeholder="1"
                        placeholderTextColor="#9CA3AF"
                        value={qty}
                        onChangeText={setQty}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  {customPrice && qty ? (
                    <Text style={st.totalLine}>
                      Total: ${(parseFloat(qty || 1) * parseFloat(customPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  ) : null}
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={[st.primaryBtn, saving && { opacity: 0.6 }]} onPress={createInvoice} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnTxt}>{BTN_LABEL}</Text>}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: '#000', paddingVertical: 14 },
  searchSpinner: { marginLeft: 8 },
  dropdown: {
    backgroundColor: '#fff', borderRadius: 12, marginTop: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    overflow: 'hidden',
  },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  dropdownName: { fontSize: 15, fontWeight: '600', color: '#000' },
  dropdownSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
});

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  invoiceName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#000', marginRight: 8 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  amount: { fontSize: 22, fontWeight: '700', color: '#059669', marginBottom: 6 },
  contactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  contactText: { fontSize: 13, color: '#6B7280' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 9 },
  sendBtn: { borderWidth: 1, borderColor: '#4F46E5' },
  sendBtnText: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },
  scheduleBtn: { borderWidth: 1, borderColor: '#059669' },
  scheduleBtnText: { fontSize: 13, color: '#059669', fontWeight: '600' },

  emptyBox: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#000' },

  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: 6, marginTop: 14 },
  field: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, fontSize: 15, color: '#000' },

  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14 },
  pickerBtnText: { fontSize: 15, color: '#000' },

  totalLine: { fontSize: 16, fontWeight: '700', color: '#059669', marginTop: 10 },

  primaryBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Schedule modal
  invSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F7FF', borderRadius: 14, padding: 14, marginBottom: 4 },
  invSummaryName: { fontSize: 15, fontWeight: '700', color: '#000' },
  invSummaryContact: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  invSummaryAmt: { fontSize: 20, fontWeight: '700', color: '#059669', marginLeft: 8 },
  calRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', marginBottom: 6, backgroundColor: '#fff' },
  calRowSel: { borderColor: '#4F46E5', backgroundColor: '#F8F7FF' },
  calDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  calName: { fontSize: 15, color: '#374151', fontWeight: '500' },
  durRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#fff' },
  durChipSel: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  durChipTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },
  durChipTxtSel: { color: '#fff', fontWeight: '700' },

  // Product picker
  prodRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  prodRowSel: { backgroundColor: '#F8F7FF' },
  prodName: { fontSize: 15, color: '#000', fontWeight: '500' },
  prodPrice: { fontSize: 15, fontWeight: '700', color: '#059669' },
});
