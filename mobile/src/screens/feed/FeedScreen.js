import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Avatar, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function FeedScreen({ navigation }) {
  const { user } = useAuth();
  const [notes, setNotes]         = useState([]);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load(p = 1, refresh = false) {
    if (loading || (done && !refresh)) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/feed?page=${p}&limit=20`);
      const incoming = data.notes || [];
      if (refresh) setNotes(incoming);
      else setNotes(prev => [...prev, ...incoming]);
      if (incoming.length < 20) setDone(true);
      setPage(p + 1);
    } catch (e) { toast(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(1, true); }, []);

  const onRefresh = () => {
    setDone(false); setRefreshing(true); load(1, true);
  };

  async function toggleFollow(authorId, isFollowing) {
    if (!user) { toast('Sign in to follow'); return; }
    try {
      if (isFollowing) await apiFetch(`/follows/${authorId}`, { method: 'DELETE' });
      else             await apiFetch(`/follows/${authorId}`, { method: 'POST', body: '{}' });
      setNotes(prev => prev.map(n =>
        n.author.id === authorId
          ? { ...n, author: { ...n.author, isFollowing: !isFollowing } }
          : n
      ));
    } catch (e) { toast(e.message); }
  }

  function renderCard({ item: n }) {
    const a = n.author;
    const isOwnNote = user?.userId === a.id;
    const reactionTotal = (n.reactions || []).reduce((s, r) => s + r.c, 0);
    const topEmoji = [...(n.reactions || [])].sort((a, b) => b.c - a.c).slice(0, 2).map(r => r.emoji).join('') || '♡';
    const initial  = (a.displayName || a.username || '?').charAt(0).toUpperCase();

    return (
      <View style={[s.card, Shadow.sm]}>
        {n.bgUrl && (
          <ImageBackground source={{ uri: n.bgUrl }} style={s.bgImg} imageStyle={{ borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg }}>
            <View style={s.bgOverlay} />
          </ImageBackground>
        )}
        <View style={s.cardBody}>
          {/* Author row */}
          <View style={s.authorRow}>
            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: a.id })} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
              <Avatar uri={a.avatarUrl} initial={initial} size={34} />
              <View>
                <Text style={s.authorName}>{a.displayName || a.username}</Text>
                <Text style={s.authorHandle}>@{a.username} · {relTime(n.createdAt)}</Text>
              </View>
            </TouchableOpacity>
            {!isOwnNote && user && (
              <TouchableOpacity onPress={() => toggleFollow(a.id, a.isFollowing)}
                style={[s.followBtn, a.isFollowing && s.followBtnActive]}
              >
                <Text style={[s.followBtnText, a.isFollowing && s.followBtnTextActive]}>
                  {a.isFollowing ? '✓ Following' : '+ Follow'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          {n.title && <Text style={s.noteTitle} numberOfLines={2}>{n.title}</Text>}
          {n.body  && <Text style={s.noteBody}  numberOfLines={5}>{n.body}</Text>}

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('NoteDetail', { noteId: n.id, notes })}>
              <Text style={s.actionText}>{topEmoji} {reactionTotal > 0 ? reactionTotal : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('NoteDetail', { noteId: n.id, notes })}>
              <Text style={s.actionText}>💬 {n.replyCount || 0}</Text>
            </TouchableOpacity>
            {!isOwnNote && user && (
              <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('Chat', { userId: a.id, username: a.username })}>
                <Text style={s.actionText}>✉️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>🌍 Public Feed</Text>
      </View>
      <FlatList
        data={notes}
        keyExtractor={n => n.id}
        renderItem={renderCard}
        contentContainerStyle={s.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onEndReached={() => load(page)}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.accent} style={{ padding: 20 }} /> : null}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>No public stories yet.</Text>
            <Text style={[s.emptyText, { fontSize: 13, marginTop: 6 }]}>Share an entry to the feed to get started 🌍</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

function relTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  header:      { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  list:        { padding: 12, paddingBottom: 100, gap: 12 },
  card:        { backgroundColor: Colors.surface2, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  bgImg:       { height: 90, width: '100%' },
  bgOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  cardBody:    { padding: 14 },
  authorRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  authorName:  { fontSize: 14, fontWeight: '700', color: Colors.ink },
  authorHandle:{ fontSize: 11, color: Colors.ink4, marginTop: 1 },
  followBtn:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.accent },
  followBtnActive: { backgroundColor: Colors.accentBg },
  followBtnText:   { fontSize: 12, fontWeight: '700', color: Colors.accent },
  followBtnTextActive: { color: Colors.accent },
  noteTitle:   { fontSize: 16, fontWeight: '700', color: Colors.ink, marginBottom: 6 },
  noteBody:    { fontSize: 13, color: Colors.ink3, lineHeight: 20, marginBottom: 10 },
  actions:     { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 10 },
  actionBtn:   {},
  actionText:  { fontSize: 14, color: Colors.ink3, fontWeight: '600' },
  empty:       { alignItems: 'center', paddingTop: 80 },
  emptyText:   { color: Colors.ink4, fontSize: 15, textAlign: 'center' },
});
