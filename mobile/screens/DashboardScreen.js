import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, SafeAreaView,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadStats() {
    try {
      const today = new Date().toDateString();
      const [apptRes, invRes] = await Promise.all([
        client.get('/ghl/appointments').catch(() => ({ data: { events: [] } })),
        client.get('/ghl/invoices').catch(() => ({ data: { invoices: [] } })),
      ]);

      const events = apptRes.data.events || [];
      const invoices = invRes.data.invoices || [];

      const jobsToday = events.filter(e =>
        e.startTime && new Date(e.startTime).toDateString() === today
      ).length;

      const quotes = invoices.filter(i =>
        i.status === 'draft' || i.status === 'sent'
      ).length;

      const totalToday = invoices
        .filter(i => {
          const d = i.createdAt || i.issueDate || i.dateAdded;
          return d && new Date(d).toDateString() === today;
        })
        .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

      setStats({ jobsToday, quotes, totalToday });
    } catch {
      setStats({ jobsToday: 0, quotes: 0, totalToday: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  const name = user?.email?.split('@')[0] || 'there';

  const STATS = [
    { key: 'jobsToday', label: 'Jobs Today', icon: 'briefcase', color: '#4F46E5', bg: '#EDE9FE' },
    { key: 'quotes', label: 'Quotes', icon: 'document-text', color: '#059669', bg: '#D1FAE5' },
    { key: 'totalToday', label: "Today's Total", icon: 'cash', color: '#D97706', bg: '#FEF3C7', currency: true },
  ];

  const ACTIONS = [
    { icon: 'receipt', label: 'Invoice', color: '#4F46E5', bg: '#EDE9FE', onPress: () => navigation.navigate('More', { screen: 'Invoices' }) },
    { icon: 'document-text-outline', label: 'Estimate', color: '#059669', bg: '#D1FAE5', onPress: () => navigation.navigate('More', { screen: 'Estimates', params: { openForm: true } }) },
    { icon: 'person-add', label: 'New Contact', color: '#D97706', bg: '#FEF3C7', onPress: () => navigation.navigate('More', { screen: 'Contacts' }) },
    { icon: 'calendar', label: 'Schedule', color: '#DC2626', bg: '#FEE2E2', onPress: () => navigation.navigate('Calendar') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); }} tintColor="#4F46E5" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greet()},</Text>
            <Text style={styles.name}>{name}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{name[0]?.toUpperCase()}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#4F46E5" style={{ marginTop: 60 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Today</Text>
            <View style={styles.statsGrid}>
              {STATS.map(({ key, label, icon, color, bg, currency }) => (
                <View key={key} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: bg }]}>
                    <Ionicons name={icon} size={22} color={color} />
                  </View>
                  <Text style={styles.statValue}>
                    {currency ? `$${stats[key].toLocaleString()}` : stats[key]}
                  </Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {ACTIONS.map(({ icon, label, color, bg, onPress }) => (
                <TouchableOpacity key={label} style={styles.actionCard} onPress={onPress}>
                  <View style={[styles.actionIcon, { backgroundColor: bg }]}>
                    <Ionicons name={icon} size={22} color={color} />
                  </View>
                  <Text style={styles.actionLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
  },
  greeting: { fontSize: 15, color: '#6B7280', fontWeight: '400' },
  name: { fontSize: 28, fontWeight: '700', color: '#000', marginTop: 2 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '700' },

  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 20, marginBottom: 12, marginTop: 4,
  },

  statsGrid: {
    flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 28,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#000' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 32,
  },
  actionCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#000' },
});
