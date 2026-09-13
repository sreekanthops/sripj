import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Avatar, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useWSMessage } from '../../hooks/useWebSocket';

export default function ConversationsScreen({ navigation }) {
  const [convos, setConvos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);

  async function load() {
    try {
      const data = await apiFetch('/conversations');
      const list = data.conversations || [];
      setConvos(list);
      setUnreadTotal(list.reduce((s, c) => s + (c.unreadCount || 0), 0));
    } catch {}
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  // Real-time: new message bumps the conversation to the top
  useWSMessage((msg) => {
    if (msg.type === 'new_message') {
      setConvos(prev => {
        const updated = prev.map(c =>
          c.id === msg.message.conversationId
            ? { ...c, lastMessage: msg.message, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        );
        updated.sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
        return updated;
      });
      setUnreadTotal(c => c + 1);
    }
  });

  function renderConvo({ item: c }) {
    const other   = c.otherUser || {};
    const initial = (other.displayName || other.username || '?').charAt(0).toUpperCase();
    const preview = c.lastMessage?.body || 'No messages yet';
    return (
      <TouchableOpacity
        style={[s.row, Shadow.sm]}
        onPress={() => navigation.navigate('ChatThread', { conversationId: c.id, otherUser: other })}
        activeOpacity={0.8}
      >
        <Avatar uri={other.avatarUrl} initial={initial} size={44} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.name}>{other.displayName || other.username}</Text>
          <Text style={s.preview} numberOfLines={1}>{preview}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {c.lastMessage && <Text style={s.time}>{relTime(c.lastMessage.createdAt)}</Text>}
          {c.unreadCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{c.unreadCount}</Text></View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>💬 Messages</Text>
      </View>
      <FlatList
        data={convos}
        keyExtractor={c => c.id}
        renderItem={renderConvo}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No conversations yet. Follow someone and send a message!</Text>}
      />
    </SafeAreaView>
  );
}

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  header:      { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  list:        { paddingVertical: 6, paddingHorizontal: 12, paddingBottom: 100, gap: 8 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: Radius.lg, padding: 14, borderWidth: 1, borderColor: Colors.border },
  name:        { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 3 },
  preview:     { fontSize: 13, color: Colors.ink4 },
  time:        { fontSize: 11, color: Colors.ink4, marginBottom: 4 },
  badge:       { backgroundColor: Colors.accent, borderRadius: Radius.full, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText:   { color: Colors.white, fontSize: 10, fontWeight: '700' },
  empty:       { textAlign: 'center', color: Colors.ink4, padding: 40, fontSize: 14, lineHeight: 22 },
});
