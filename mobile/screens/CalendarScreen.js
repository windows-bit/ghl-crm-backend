import React, { useEffect, useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, Modal, RefreshControl, Dimensions,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

const { width: SW } = Dimensions.get('window');
const TIME_COL_W = 46;
const HOUR_H = 64;
const TIME_START = 7;
const TIME_END = 21;
const HOURS = Array.from({ length: TIME_END - TIME_START + 1 }, (_, i) => TIME_START + i);
const TOTAL_H = HOURS.length * HOUR_H;
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CALENDAR_COLORS = {
  jobs: '#059669',
  quotes: '#7C3AED',
  'soft wash': '#0EA5E9',
  'pressure washing': '#D97706',
};

function calColor(evt) {
  const name = (evt._calendarName || '').toLowerCase();
  return evt._calendarColor || CALENDAR_COLORS[name] || '#4F46E5';
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmt12(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtHour(h) {
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function fmtDateLong(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDuration(start, end) {
  if (!start || !end) return '';
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 1) return '';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
}

function DetailRow({ icon, text, color }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={16} color="#9CA3AF" style={{ marginRight: 10, marginTop: 2 }} />
      <Text style={[s.detailText, color ? { color } : null]}>{text}</Text>
    </View>
  );
}

export default function CalendarScreen() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [view, setView] = useState('week');
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [dayDate, setDayDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const scrollRef = useRef(null);
  const today = new Date();

  useEffect(() => { loadEvents(); }, []);

  useEffect(() => {
    if (!loading && !errorMsg) {
      const now = new Date();
      const y = Math.max(0, (now.getHours() + now.getMinutes() / 60 - TIME_START - 1) * HOUR_H);
      setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 200);
    }
  }, [loading]);

  async function loadEvents() {
    setErrorMsg('');
    try {
      const res = await client.get('/ghl/appointments', { timeout: 20000 });
      setEvents(res.data.events || []);
    } catch (err) {
      const msg = err.code === 'ECONNABORTED'
        ? 'Request timed out. Try again.'
        : err.response?.data?.error || err.message;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const visibleDays = view === 'day' ? [dayDate] : weekDays;
  const dayColW = (SW - TIME_COL_W) / visibleDays.length;

  function eventsForDay(date) {
    const ds = date.toDateString();
    return events.filter(e => e.startTime && new Date(e.startTime).toDateString() === ds);
  }

  function navigate(dir) {
    if (view === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + dir * 7);
      setWeekStart(getWeekStart(d));
    } else {
      const d = new Date(dayDate);
      d.setDate(d.getDate() + dir);
      setDayDate(d);
    }
  }

  const navLabel = view === 'week'
    ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const nowY = (today.getHours() + today.getMinutes() / 60 - TIME_START) * HOUR_H;
  const todayVisible = visibleDays.some(d => d.toDateString() === today.toDateString());
  const showNow = todayVisible && nowY >= 0 && nowY < TOTAL_H;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Calendar</Text>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={() => { setWeekStart(getWeekStart(new Date())); setDayDate(new Date()); }} style={s.todayBtn}>
            <Text style={s.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <View style={s.viewPicker}>
            {['day', 'week'].map(v => (
              <TouchableOpacity
                key={v}
                style={[s.viewBtn, view === v && s.viewBtnOn]}
                onPress={() => setView(v)}
              >
                <Text style={[s.viewBtnTxt, view === v && s.viewBtnTxtOn]}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 60 }} />
      ) : errorMsg ? (
        <View style={s.emptyBox}>
          <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
          <Text style={[s.emptyTitle, { color: '#DC2626' }]}>Calendar Error</Text>
          <Text style={[s.emptyText, { textAlign: 'center', paddingHorizontal: 32 }]}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => { setRefreshing(true); loadEvents(); }} style={s.retryBtn}>
            <Text style={s.retryBtnTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Nav */}
          <View style={s.nav}>
            <TouchableOpacity onPress={() => navigate(-1)} style={s.navBtn}>
              <Ionicons name="chevron-back" size={20} color="#4F46E5" />
            </TouchableOpacity>
            <Text style={s.navLabel}>{navLabel}</Text>
            <TouchableOpacity onPress={() => navigate(1)} style={s.navBtn}>
              <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={s.dayHeaders}>
            <View style={{ width: TIME_COL_W }} />
            {visibleDays.map((day, i) => {
              const isToday = day.toDateString() === today.toDateString();
              return (
                <View key={i} style={[s.dayHeaderCell, { width: dayColW }]}>
                  <Text style={[s.dayLetter, isToday && { color: '#4F46E5' }]}>
                    {DAY_SHORT[day.getDay()]}
                  </Text>
                  <View style={[s.dayCircle, isToday && s.dayCircleToday]}>
                    <Text style={[s.dayNum, isToday && s.dayNumToday]}>{day.getDate()}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={s.divider} />

          {/* Grid */}
          <ScrollView
            ref={scrollRef}
            style={s.grid}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvents(); }} tintColor="#4F46E5" />
            }
          >
            <View style={{ height: TOTAL_H + HOUR_H, position: 'relative' }}>
              {/* Hour rows */}
              {HOURS.map((h, i) => (
                <View key={h} style={[s.hourRow, { top: i * HOUR_H, width: SW }]}>
                  <Text style={s.hourLabel}>{fmtHour(h)}</Text>
                  <View style={s.hourLine} />
                </View>
              ))}

              {/* Day columns */}
              <View style={[s.dayColsWrap, { left: TIME_COL_W, height: TOTAL_H }]}>
                {visibleDays.map((day, di) => {
                  const isToday = day.toDateString() === today.toDateString();
                  const dayEvts = eventsForDay(day);
                  return (
                    <View key={di} style={[s.dayCol, { width: dayColW }, isToday && s.dayColToday]}>
                      <View style={s.dayColBorder} />
                      {dayEvts.map((evt, ei) => {
                        const st = new Date(evt.startTime);
                        const en = evt.endTime ? new Date(evt.endTime) : new Date(st.getTime() + 3600000);
                        const top = (st.getHours() + st.getMinutes() / 60 - TIME_START) * HOUR_H;
                        const height = Math.max(((en - st) / 3600000) * HOUR_H - 2, 24);
                        if (top < -HOUR_H || top > TOTAL_H) return null;
                        const color = calColor(evt);
                        const label = evt.contactName || evt.contact?.name || evt.title || 'Appt';
                        return (
                          <TouchableOpacity
                            key={evt.id || `${di}-${ei}`}
                            style={[s.evt, { top, height, backgroundColor: color }]}
                            onPress={() => setSelectedEvent(evt)}
                            activeOpacity={0.8}
                          >
                            <Text style={s.evtName} numberOfLines={height > 44 ? 2 : 1}>{label}</Text>
                            {height > 38 && <Text style={s.evtTime}>{fmt12(evt.startTime)}</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}

                {/* Current time line */}
                {showNow && (
                  <View style={[s.nowWrap, { top: nowY }]} pointerEvents="none">
                    <View style={s.nowDot} />
                    <View style={s.nowLine} />
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </>
      )}

      {/* Event detail modal */}
      <Modal visible={!!selectedEvent} animationType="slide" transparent onRequestClose={() => setSelectedEvent(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {selectedEvent ? (() => {
              const color = calColor(selectedEvent);
              const contact = selectedEvent.contactName || selectedEvent.contact?.name;
              const status = selectedEvent.appointmentStatus || selectedEvent.status;
              const dur = fmtDuration(selectedEvent.startTime, selectedEvent.endTime);
              return (
                <>
                  <View style={[s.modalBar, { backgroundColor: color }]} />
                  <View style={s.modalInner}>
                    <View style={s.modalHead}>
                      <Text style={s.modalEvtTitle} numberOfLines={2}>
                        {selectedEvent.title || contact || 'Appointment'}
                      </Text>
                      <TouchableOpacity onPress={() => setSelectedEvent(null)}>
                        <Ionicons name="close" size={22} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                    <DetailRow icon="calendar-outline" text={fmtDateLong(selectedEvent.startTime)} />
                    <DetailRow
                      icon="time-outline"
                      text={`${fmt12(selectedEvent.startTime)}${selectedEvent.endTime ? ` – ${fmt12(selectedEvent.endTime)}` : ''}${dur ? `  ·  ${dur}` : ''}`}
                    />
                    {contact ? <DetailRow icon="person-outline" text={contact} /> : null}
                    {selectedEvent._calendarName ? (
                      <DetailRow icon="grid-outline" text={selectedEvent._calendarName} color={color} />
                    ) : null}
                    {(selectedEvent.address || selectedEvent.location) ? (
                      <DetailRow icon="location-outline" text={selectedEvent.address || selectedEvent.location} />
                    ) : null}
                    {(selectedEvent.notes || selectedEvent.note) ? (
                      <DetailRow icon="document-text-outline" text={selectedEvent.notes || selectedEvent.note} />
                    ) : null}
                    {status ? (
                      <View style={[s.statusPill, { backgroundColor: color + '22' }]}>
                        <Text style={[s.statusPillTxt, { color }]}>
                          {status.replace(/_/g, ' ').toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#000' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayBtn: { backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  todayBtnText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  viewPicker: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 8, padding: 2 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  viewBtnOn: { backgroundColor: '#fff' },
  viewBtnTxt: { fontSize: 13, fontWeight: '500', color: '#8E8E93' },
  viewBtnTxtOn: { color: '#000', fontWeight: '600' },

  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  navBtn: { padding: 8 },
  navLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#000' },

  dayHeaders: { flexDirection: 'row', backgroundColor: '#F2F2F7', paddingBottom: 6 },
  dayHeaderCell: { alignItems: 'center' },
  dayLetter: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 3 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: '#4F46E5' },
  dayNum: { fontSize: 14, fontWeight: '500', color: '#000' },
  dayNumToday: { color: '#fff', fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#E5E5EA' },

  grid: { flex: 1, backgroundColor: '#fff' },

  hourRow: {
    position: 'absolute', height: HOUR_H,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  hourLabel: {
    width: TIME_COL_W, fontSize: 10, color: '#9CA3AF',
    textAlign: 'right', paddingRight: 8, marginTop: -6, fontWeight: '500',
  },
  hourLine: { flex: 1, height: 1, backgroundColor: '#F2F2F7' },

  dayColsWrap: { position: 'absolute', top: 0, right: 0, flexDirection: 'row' },
  dayCol: { position: 'relative' },
  dayColToday: { backgroundColor: '#F8F7FF' },
  dayColBorder: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#F2F2F7' },

  evt: {
    position: 'absolute', left: 2, right: 2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 3, overflow: 'hidden',
  },
  evtName: { fontSize: 11, fontWeight: '700', color: '#fff' },
  evtTime: { fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

  nowWrap: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626', marginLeft: -4 },
  nowLine: { flex: 1, height: 1.5, backgroundColor: '#DC2626' },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  retryBtn: { marginTop: 12, backgroundColor: '#4F46E5', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: 40 },
  modalBar: { height: 4 },
  modalInner: { padding: 20 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalEvtTitle: { fontSize: 20, fontWeight: '700', color: '#000', flex: 1, marginRight: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  detailText: { fontSize: 15, color: '#374151', flex: 1, lineHeight: 20 },
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
  statusPillTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
