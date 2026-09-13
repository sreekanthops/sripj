import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '../../theme';
import { Avatar, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useWSMessage } from '../../hooks/useWebSocket';

const TYPE_ICONS = { follow: '👤', reaction: '♡', reply: '💬', message: '✉️' };

export default function NotificationsScreen({ navigation }) {
  const [notifs, setNotifs]     = useState([]);
  const [unread, setUnread]     = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const data = await apiFetch('/notifications');
      setNotifs(data.notifications || []);
      setUnread((data.notifications || []).filter(n => !n.read).length);
    } catch {}
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  // Real-time: new notification pushed via WS
  useWSMessage((msg) => {
    if (msg.type === 'notification') {
      setNotifs(prev => [msg.notification, ...prev]);
      setUnread(c => c + 1);
    }
  });

  async function markAllRead() {
    try {
      await apiFetch('/notifications/read', { method: 'PUT', body: '{}' });
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch {}
  }

  function handlePress(n) {
    if (!n.read) markRead(n.id);
    if (n.type === 'message' && n.conversationId) {
      navigation.navigate('ChatThread', { conversationId: n.conversationId });
    } else if (n.noteId) {
      navigation.navigate('NoteDetail', { noteId: n.noteId, notes: [] });
    } else if (n.actor?.id) {
      navigation.navigate('UserProfile', { userId: n.actor.id });
    }
  }

  async function markRead(id) {
    try { await apiFetch('/notifications/read', { method: 'PUT', body: JSON.stringify({ id }) }); } catch {}
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(c => Math.max(0, c - 1));
  }

  function renderNotif({ item: n }) {
    const initial = (n.actor?.displayName || n.actor?.username || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        style={[s.row, !n.read && s.rowUnread]}
        onPress={() => handlePress(n)}
        activeOpacity={0.75}
      >
        <View style={s.iconWrap}>
          <Avatar uri={n.actor?.avatarUrl} initial={initial} size={38} />
          <View style={s.typeIcon}><Text style={s.typeIconText}>{TYPE_ICONS[n.type] || '🔔'}</Text></View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.notifText} numberOfLines={2}>{buildMessage(n)}</Text>
          <Text style={s.notifTime}>{relTime(n.createdAt)}</Text>
        </View>
        {!n.read && <View style={s.dot} />}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>🔔 Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={s.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifs}
        keyExtractor={n => n.id}
        renderItem={renderNotif}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No notifications yet.</Text>}
      />
    </SafeAreaView>
  );
}

function buildMessage(n) {
  const actor = n.actor?.displayName || n.actor?.username || 'Someone';
  if (n.type === 'follow')   return `${actor} started following you`;
  if (n.type === 'reaction') return `${actor} reacted to your story ${n.noteTitle ? `"${n.noteTitle}"` : ''}`;
  if (n.type === 'reply')    return `${actor} replied on ${n.noteTitle ? `"${n.noteTitle}"` : 'your story'}`;
  if (n.type === 'message')  return `${actor} sent you a message`;
  return `${actor} interacted with you`;
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
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  markAll:     { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  list:        { paddingBottom: 100 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: Colors.border },
  rowUnread:   { backgroundColor: Colors.accentBg },
  iconWrap:    { position: 'relative' },
  typeIcon:    { position: 'absolute', bottom: -2, right: -2, backgroundColor: Colors.surface2, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  typeIconText:{ fontSize: 10 },
  notifText:   { fontSize: 13, color: Colors.ink2, lineHeight: 18 },
  notifTime:   { fontSize: 11, color: Colors.ink4, marginTop: 3 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  empty:       { textAlign: 'center', color: Colors.ink4, padding: 40, fontSize: 14 },
});
