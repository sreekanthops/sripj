import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Avatar, Button, Divider, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const { user: me } = useAuth();
  const [profile, setProfile]   = useState(null);
  const [follows, setFollows]   = useState({ followerCount: 0, followingCount: 0, isFollowing: false });
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);

  async function load() {
    try {
      const [prof, fol, noteData] = await Promise.all([
        apiFetch(`/users/${userId}`),
        apiFetch(`/follows/${userId}`),
        apiFetch(`/notes?userId=${userId}&tf=all&public=1`),
      ]);
      setProfile(prof.user || prof);
      setFollows(fol);
      setNotes(noteData.notes || []);
    } catch (e) { toast(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function toggleFollow() {
    if (!me) { toast('Sign in to follow'); return; }
    try {
      if (follows.isFollowing) {
        await apiFetch(`/follows/${userId}`, { method: 'DELETE' });
        setFollows(f => ({ ...f, isFollowing: false, followerCount: f.followerCount - 1 }));
      } else {
        await apiFetch(`/follows/${userId}`, { method: 'POST', body: '{}' });
        setFollows(f => ({ ...f, isFollowing: true, followerCount: f.followerCount + 1 }));
      }
    } catch (e) { toast(e.message); }
  }

  async function startChat() {
    if (!me) { toast('Sign in to message'); return; }
    try {
      const data = await apiFetch('/conversations', { method: 'POST', body: JSON.stringify({ userId }) });
      navigation.navigate('ChatThread', { conversationId: data.conversation.id, otherUser: profile });
    } catch (e) { toast(e.message); }
  }

  if (!profile) return null;
  const isOwnProfile = me?.userId === userId;
  const initial = (profile.displayName || profile.username || '?').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Back */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Avatar + info */}
        <View style={s.profileHead}>
          <Avatar uri={profile.avatarUrl} initial={initial} size={72} />
          <Text style={s.displayName}>{profile.displayName || profile.username}</Text>
          <Text style={s.username}>@{profile.username}</Text>
          {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{notes.length}</Text>
            <Text style={s.statLabel}>Posts</Text>
          </View>
          <View style={s.statDiv} />
          <TouchableOpacity style={s.stat} onPress={() => navigation.navigate('UserList', { userId, type: 'followers' })}>
            <Text style={s.statNum}>{follows.followerCount}</Text>
            <Text style={s.statLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={s.statDiv} />
          <TouchableOpacity style={s.stat} onPress={() => navigation.navigate('UserList', { userId, type: 'following' })}>
            <Text style={s.statNum}>{follows.followingCount}</Text>
            <Text style={s.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        {!isOwnProfile && (
          <View style={s.actionRow}>
            <Button
              title={follows.isFollowing ? '✓ Following' : '+ Follow'}
              variant={follows.isFollowing ? 'ghost' : 'primary'}
              onPress={toggleFollow}
              style={{ flex: 1 }}
            />
            <Button title="✉️ Message" variant="ghost" onPress={startChat} style={{ flex: 1 }} />
          </View>
        )}

        <Divider />

        {/* Public notes */}
        <Text style={s.sectionTitle}>Public Stories</Text>
        {notes.length === 0 ? (
          <Text style={s.empty}>No public stories yet.</Text>
        ) : (
          notes.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[s.noteCard, Shadow.sm]}
              onPress={() => navigation.navigate('NoteDetail', { noteId: n.id, notes })}
            >
              {n.title ? <Text style={s.noteTitle} numberOfLines={1}>{n.title}</Text> : null}
              {n.body  ? <Text style={s.noteBody}  numberOfLines={2}>{n.body}</Text>  : null}
              <Text style={s.noteMeta}>{fmtDate(n.createdAt)} · ♡ {n.reactionCount || 0}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  scroll:      { padding: 16, paddingBottom: 80 },
  back:        { marginBottom: 16 },
  backText:    { color: Colors.accent, fontSize: 14 },
  profileHead: { alignItems: 'center', paddingBottom: 16 },
  displayName: { fontSize: 20, fontWeight: '800', color: Colors.ink, marginTop: 10, marginBottom: 2 },
  username:    { fontSize: 13, color: Colors.ink4, marginBottom: 6 },
  bio:         { fontSize: 13, color: Colors.ink3, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  statsRow:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14 },
  stat:        { alignItems: 'center', paddingHorizontal: 22 },
  statNum:     { fontSize: 20, fontWeight: '800', color: Colors.ink },
  statLabel:   { fontSize: 10, color: Colors.ink4, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statDiv:     { width: 1, backgroundColor: Colors.border2, height: 32, alignSelf: 'center' },
  actionRow:   { flexDirection: 'row', gap: 10, marginBottom: 4 },
  sectionTitle:{ fontSize: 13, fontWeight: '700', color: Colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  empty:       { color: Colors.ink4, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  noteCard:    { backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10 },
  noteTitle:   { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 4 },
  noteBody:    { fontSize: 13, color: Colors.ink3, lineHeight: 18, marginBottom: 6 },
  noteMeta:    { fontSize: 11, color: Colors.ink4 },
});
