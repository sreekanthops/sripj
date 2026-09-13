import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Button, TextField, Avatar, Divider, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshMe } = useAuth();
  const [profile, setProfile]       = useState(null);
  const [editing, setEditing]       = useState(false);
  const [name, setName]             = useState('');
  const [bio, setBio]               = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [followStats, setFollowStats] = useState({ followerCount: 0, followingCount: 0 });

  async function load() {
    try {
      const [me, follows] = await Promise.all([
        apiFetch('/auth/me'),
        apiFetch(`/follows/${user.userId}`),
      ]);
      const u = me.user || me;
      setProfile(u);
      setName(u.displayName || '');
      setBio(u.bio || '');
      setEmail(u.email || '');
      setPhone(u.phone || '');
      setFollowStats({ followerCount: follows.followerCount, followingCount: follows.followingCount });
    } catch {}
  }

  useEffect(() => { if (user) load(); }, [user]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: name, bio, email, phone }) });
      toast('Profile saved ✅');
      setEditing(false);
      refreshMe();
    } catch (e) { toast(e.message); }
    finally { setSaving(false); }
  }

  async function changeAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { toast('Photo library permission denied'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const form  = new FormData();
    form.append('avatar', { uri: asset.uri, name: 'avatar.jpg', type: 'image/jpeg' });
    try {
      const data = await apiFetch('/auth/avatar', { method: 'POST', headers: {}, body: form });
      toast('Avatar updated ✅');
      refreshMe();
    } catch (e) { toast(e.message); }
  }

  async function doLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  }

  if (!user) return null;

  const initial = (profile?.displayName || profile?.username || '?').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Avatar + name */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={changeAvatar}>
            <Avatar uri={profile?.avatarUrl} initial={initial} size={80} style={{ marginBottom: 8 }} />
            <Text style={s.changePhoto}>📷 Change</Text>
          </TouchableOpacity>
          <Text style={s.displayName}>{profile?.displayName || profile?.username}</Text>
          <Text style={s.usernameText}>@{profile?.username}</Text>
          {profile?.bio ? <Text style={s.bioText}>{profile.bio}</Text> : null}
        </View>

        {/* Follow stats */}
        <View style={s.statsRow}>
          <TouchableOpacity style={s.stat} onPress={() => navigation.navigate('UserList', { userId: user.userId, type: 'followers' })}>
            <Text style={s.statNum}>{followStats.followerCount}</Text>
            <Text style={s.statLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={s.statDiv} />
          <TouchableOpacity style={s.stat} onPress={() => navigation.navigate('UserList', { userId: user.userId, type: 'following' })}>
            <Text style={s.statNum}>{followStats.followingCount}</Text>
            <Text style={s.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        <Divider />

        {/* Edit profile */}
        {editing ? (
          <View style={s.editSection}>
            <TextField label="Display Name" value={name} onChangeText={setName} />
            <TextField label="Bio" value={bio} onChangeText={setBio} multiline inputStyle={{ minHeight: 70, textAlignVertical: 'top' }} />
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button title="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button title="Edit Profile" variant="ghost" onPress={() => setEditing(true)} style={{ marginTop: 4 }} />
        )}

        <Divider />
        <Button title="Sign Out" variant="danger" onPress={doLogout} style={{ marginTop: 4 }} />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.bg },
  scroll:       { padding: 20, paddingBottom: 80 },
  avatarSection:{ alignItems: 'center', paddingBottom: 16 },
  changePhoto:  { fontSize: 11, color: Colors.accent, textAlign: 'center', marginBottom: 10 },
  displayName:  { fontSize: 20, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  usernameText: { fontSize: 13, color: Colors.ink4, marginBottom: 6 },
  bioText:      { fontSize: 13, color: Colors.ink3, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  statsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 0, paddingVertical: 16 },
  stat:         { alignItems: 'center', paddingHorizontal: 28 },
  statNum:      { fontSize: 22, fontWeight: '800', color: Colors.ink },
  statLabel:    { fontSize: 11, color: Colors.ink4, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statDiv:      { width: 1, backgroundColor: Colors.border2, height: 36, alignSelf: 'center' },
  editSection:  { marginTop: 4 },
});
