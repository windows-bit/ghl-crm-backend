import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PaperProvider } from 'react-native-paper';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './context/AuthContext';

import LoginScreen from './screens/LoginScreen';
import GHLSetupScreen from './screens/GHLSetupScreen';
import DashboardScreen from './screens/DashboardScreen';
import ContactsScreen from './screens/ContactsScreen';
import PipelinesScreen from './screens/PipelinesScreen';
import ConversationsScreen from './screens/ConversationsScreen';
import AutomationsScreen from './screens/AutomationsScreen';
import InvoicesScreen from './screens/InvoicesScreen';
import CalendarScreen from './screens/CalendarScreen';
import TimeTrackingScreen from './screens/TimeTrackingScreen';
import MoreScreen from './screens/MoreScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Dashboard: ['grid', 'grid-outline'],
  Conversations: ['chatbubbles', 'chatbubbles-outline'],
  Calendar: ['calendar', 'calendar-outline'],
  Timesheet: ['time', 'time-outline'],
  More: ['ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'],
};

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreHome" component={MoreScreen} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="Estimates" component={InvoicesScreen} initialParams={{ mode: 'estimate' }} />
      <Stack.Screen name="Pipelines" component={PipelinesScreen} />
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="Automations" component={AutomationsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#C7C7CC',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0.5,
          borderTopColor: '#E5E5EA',
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name];
          return <Ionicons name={focused ? active : inactive} size={26} color={color} />;
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Conversations" component={ConversationsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Timesheet" component={TimeTrackingScreen} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : !user.hasGhlKey ? (
        <Stack.Screen name="GHLSetup" component={GHLSetupScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PaperProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </PaperProvider>
    </AuthProvider>
  );
}
