import React, { useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ToastContainer } from './src/components/UI';
import { Colors, Radius } from './src/theme';
import { connectWS, disconnectWS } from './src/hooks/useWebSocket';

// ── Screens ───────────────────────────────────────────────────────────────────
import LoginScreen           from './src/screens/auth/LoginScreen';
import ForgotPasswordScreen  from './src/screens/auth/ForgotPasswordScreen';
import HomeScreen            from './src/screens/home/HomeScreen';
import NoteDetailScreen      from './src/screens/note/NoteDetailScreen';
import NoteFormScreen        from './src/screens/note/NoteFormScreen';
import FeedScreen            from './src/screens/feed/FeedScreen';
import NotificationsScreen   from './src/screens/notifications/NotificationsScreen';
import ConversationsScreen   from './src/screens/chat/ConversationsScreen';
import ChatThreadScreen      from './src/screens/chat/ChatThreadScreen';
import ProfileScreen         from './src/screens/profile/ProfileScreen';
import UserProfileScreen     from './src/screens/profile/UserProfileScreen';
import UserListScreen        from './src/screens/profile/UserListScreen';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── Shared stack screens (modal-style, reachable from any tab) ────────────────
function SharedStack({ children }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {children}
      <Stack.Screen name="NoteDetail"   component={NoteDetailScreen} />
      <Stack.Screen name="NoteForm"     component={NoteFormScreen}   />
      <Stack.Screen name="UserProfile"  component={UserProfileScreen}/>
      <Stack.Screen name="UserList"     component={UserListScreen}   options={{ headerShown: true, headerBackTitle: '', headerStyle: { backgroundColor: Colors.bg }, headerTintColor: Colors.accent }} />
      <Stack.Screen name="ChatThread"   component={ChatThreadScreen} options={{ headerShown: true, headerBackTitle: '', headerStyle: { backgroundColor: Colors.bg }, headerTintColor: Colors.accent }} />
    </Stack.Navigator>
  );
}

// ── Tab stacks ────────────────────────────────────────────────────────────────
function HomeStack()  { return <SharedStack><Stack.Screen name="Home"   component={HomeScreen}  /></SharedStack>; }
function FeedStack()  { return <SharedStack><Stack.Screen name="Feed"   component={FeedScreen}  /></SharedStack>; }
function ChatStack()  { return <SharedStack><Stack.Screen name="Convos" component={ConversationsScreen} /></SharedStack>; }
function NotifStack() { return <SharedStack><Stack.Screen name="Notifs" component={NotificationsScreen} /></SharedStack>; }
function ProfileStack(){ return <SharedStack><Stack.Screen name="Profile" component={ProfileScreen} /></SharedStack>; }

// ── Tab bar icon helper ───────────────────────────────────────────────────────
function TabIcon({ icon, focused, badge }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{icon}</Text>
      {badge > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -8,
          backgroundColor: Colors.red, borderRadius: 8,
          minWidth: 16, height: 16, paddingHorizontal: 3,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

// ── Main tabs ─────────────────────────────────────────────────────────────────
function MainTabs() {
  const [chatBadge, setChatBadge]   = useState(0);
  const [notifBadge, setNotifBadge] = useState(0);

  // Connect WS when entering app
  useEffect(() => {
    connectWS();
    return () => disconnectWS();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border2,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 82 : 62,
          paddingBottom: Platform.OS === 'ios' ? 22 : 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor:   Colors.accent,
        tabBarInactiveTintColor: Colors.ink4,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="HomeTab"   component={HomeStack}
        options={{ title: 'Home',   tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }} />
      <Tab.Screen name="FeedTab"   component={FeedStack}
        options={{ title: 'Feed',   tabBarIcon: ({ focused }) => <TabIcon icon="🌍" focused={focused} /> }} />
      <Tab.Screen name="WriteTab"  component={NoteFormScreen}
        options={{ title: 'Write',  tabBarIcon: ({ focused }) => <TabIcon icon="✦" focused={focused} /> }}
        listeners={({ navigation }) => ({
          tabPress: e => { e.preventDefault(); navigation.navigate('HomeTab', { screen: 'NoteForm', params: {} }); }
        })}
      />
      <Tab.Screen name="ChatTab"   component={ChatStack}
        options={{ title: 'Chat', tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} badge={chatBadge} /> }} />
      <Tab.Screen name="NotifTab"  component={NotifStack}
        options={{ title: 'Alerts', tabBarIcon: ({ focused }) => <TabIcon icon="🔔" focused={focused} badge={notifBadge} /> }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

// ── Auth stack ────────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"          component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="GuestFeed"      component={FeedScreen} />
    </Stack.Navigator>
  );
}

// ── Root — swaps between auth and app based on auth state ─────────────────────
function RootNavigator() {
  const { user, ready } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  return user ? <MainTabs /> : <AuthStack />;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <ToastContainer />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
