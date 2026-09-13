import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { wsSend, useWSMessage } from '../../hooks/useWebSocket';

export default function ChatThreadScreen({ route, navigation }) {
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: otherUser?.displayName || otherUser?.username || 'Chat' });
    load();
    markRead();
  }, [conversationId]);

  async function load() {
    try {
      const data = await apiFetch(`/messages/${conversationId}`);
      setMessages((data.messages || []).reverse());
    } catch {}
    setLoading(false);
  }

  async function markRead() {
    try { await apiFetch(`/messages/${conversationId}/read`, { method: 'PUT', body: '{}' }); } catch {}
  }

  // Incoming real-time messages
  useWSMessage((msg) => {
    if (msg.type === 'new_message' && msg.message.conversationId === conversationId) {
      setMessages(prev => [...prev, msg.message]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      markRead();
    }
  });

  async function send() {
    const body = input.trim();
    if (!body) return;
    setInput('');
    // Optimistic
    const temp = { id: 'tmp-' + Date.now(), conversationId, senderId: user.userId, body, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, temp]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const data = await apiFetch(`/messages/${conversationId}`, { method: 'POST', body: JSON.stringify({ body }) });
      setMessages(prev => prev.map(m => m.id === temp.id ? data.message : m));
    } catch (e) {
      toast(e.message);
      setMessages(prev => prev.filter(m => m.id !== temp.id));
      setInput(body);
    }
  }

  function renderMsg({ item: m }) {
    const isMine = m.senderId === user?.userId;
    return (
      <View style={[s.msgWrap, isMine ? s.msgWrapMine : s.msgWrapOther]}>
        <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
          <Text style={[s.msgText, isMine ? s.msgTextMine : s.msgTextOther]}>{m.body}</Text>
          <Text style={[s.msgTime, isMine ? { color: 'rgba(255,255,255,0.7)' } : {}]}>{fmtTime(m.createdAt)}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMsg}
          contentContainerStyle={s.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={!loading ? <Text style={s.empty}>Start a conversation…</Text> : null}
        />
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message…"
            placeholderTextColor={Colors.ink4}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity onPress={send} style={s.sendBtn}>
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.bg },
  list:         { padding: 12, paddingBottom: 8, gap: 6 },
  msgWrap:      { flexDirection: 'row' },
  msgWrapMine:  { justifyContent: 'flex-end' },
  msgWrapOther: { justifyContent: 'flex-start' },
  bubble:       { maxWidth: '78%', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine:   { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleOther:  { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border2, borderBottomLeftRadius: 4 },
  msgText:      { fontSize: 14, lineHeight: 20 },
  msgTextMine:  { color: Colors.white },
  msgTextOther: { color: Colors.ink },
  msgTime:      { fontSize: 10, color: Colors.ink4, marginTop: 4, textAlign: 'right' },
  empty:        { textAlign: 'center', color: Colors.ink4, paddingTop: 40, fontSize: 14 },
  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.surface },
  input:        { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.ink, borderWidth: 1, borderColor: Colors.border2, maxHeight: 100 },
  sendBtn:      { width: 40, height: 40, backgroundColor: Colors.accent, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendIcon:     { color: Colors.white, fontSize: 18, fontWeight: '700' },
});
