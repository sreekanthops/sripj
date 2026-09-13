import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Button, TextField, toast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [tab, setTab]         = useState('login');   // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  const { signup } = useAuth();

  async function doLogin() {
    setErr(''); setLoading(true);
    try {
      await login(username.trim(), password);
      // navigation handled by root navigator watching auth state
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  async function doSignup() {
    setErr(''); setLoading(true);
    try {
      await signup({ username: username.trim(), password, displayName: name.trim(), email: email.trim(), phone: phone.trim() });
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Brand */}
          <View style={s.brand}>
            <Text style={s.brandStar}>✦</Text>
            <Text style={s.brandName}>Unsent</Text>
            <Text style={s.brandSub}>STORIES</Text>
            <Text style={s.brandTagline}>Some things you can't say, but you can write.</Text>
          </View>

          {/* Tabs */}
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, tab === 'login' && s.tabActive]} onPress={() => { setTab('login'); setErr(''); }}>
              <Text style={[s.tabText, tab === 'login' && s.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === 'signup' && s.tabActive]} onPress={() => { setTab('signup'); setErr(''); }}>
              <Text style={[s.tabText, tab === 'signup' && s.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={s.form}>
            <TextField
              label="Username"
              value={username} onChangeText={setUsername}
              placeholder="your username"
              autoCapitalize="none" autoCorrect={false}
            />
            {tab === 'signup' && (
              <>
                <TextField label="Display Name" value={name} onChangeText={setName} placeholder="Your Name" />
                <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <TextField label="Phone" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />
              </>
            )}
            <TextField
              label="Password"
              value={password} onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
            {err ? <Text style={s.err}>{err}</Text> : null}
            <Button
              title={tab === 'login' ? 'Sign In' : 'Create Account'}
              onPress={tab === 'login' ? doLogin : doSignup}
              loading={loading}
              style={{ marginTop: 4 }}
            />
            {tab === 'login' && (
              <TouchableOpacity style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={s.forgot}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Guest feed */}
          <TouchableOpacity style={s.guestBtn} onPress={() => navigation.navigate('GuestFeed')}>
            <Text style={s.guestBtnText}>🌍 Browse Public Stories</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  scroll:      { padding: 28, paddingTop: 40 },
  brand:       { alignItems: 'center', marginBottom: 36 },
  brandStar:   { fontSize: 40, color: Colors.gold },
  brandName:   { fontSize: 42, fontWeight: '800', color: Colors.ink, fontStyle: 'italic', letterSpacing: -1 },
  brandSub:    { fontSize: 13, fontWeight: '700', letterSpacing: 6, color: Colors.ink2, marginTop: 2 },
  brandTagline:{ fontSize: 13, color: Colors.ink4, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  tabs:        { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 4, marginBottom: 20 },
  tab:         { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.md },
  tabActive:   { backgroundColor: Colors.accent },
  tabText:     { fontSize: 14, fontWeight: '600', color: Colors.ink3 },
  tabTextActive:{ color: Colors.white },
  form:        { gap: 0 },
  err:         { color: Colors.red, fontSize: 13, marginBottom: 8 },
  forgot:      { color: Colors.accent, fontSize: 13 },
  guestBtn:    { marginTop: 28, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  guestBtnText:{ color: Colors.accent, fontSize: 14, fontWeight: '600' },
});
