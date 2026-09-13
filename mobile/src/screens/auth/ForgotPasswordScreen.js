import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '../../theme';
import { Button, TextField } from '../../components/UI';
import { apiFetch } from '../../api/client';

export default function ForgotPasswordScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [ok, setOk]             = useState('');

  async function submit() {
    setErr(''); setOk(''); setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim() }),
      });
      setOk('A reset link has been sent to your registered email address.');
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>🔑 Forgot Password</Text>
        <Text style={s.sub}>Enter your username — we'll send a reset link to your linked email.</Text>
        <TextField
          label="Username"
          value={username} onChangeText={setUsername}
          placeholder="yourusername"
          autoCapitalize="none"
          style={{ marginTop: 20 }}
        />
        {err ? <Text style={s.err}>{err}</Text> : null}
        {ok  ? <Text style={s.ok}>{ok}</Text>  : null}
        <Button title="Send Reset Link" onPress={submit} loading={loading} style={{ marginTop: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 28, paddingTop: 20 },
  back:   { marginBottom: 20 },
  backText:{ color: Colors.accent, fontSize: 14 },
  title:  { fontSize: 22, fontWeight: '700', color: Colors.ink, marginBottom: 8 },
  sub:    { fontSize: 14, color: Colors.ink3, lineHeight: 20 },
  err:    { color: Colors.red, fontSize: 13, marginTop: 8 },
  ok:     { color: Colors.green, fontSize: 13, marginTop: 8, lineHeight: 20 },
});
