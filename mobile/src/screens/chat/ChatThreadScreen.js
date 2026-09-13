import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '../../theme';
import { toast } from '../../components/UI';
import { apiFetch, getToken, BASE_URL } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { wsSend, useWSMessage } from '../../hooks/useWebSocket';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export default function ChatThreadScreen({ route, navigation }) {
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [editingId, setEditingId] = useState(null);
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
    if (msg.type === 'message_edited' && msg.message.conversationId === conversationId) {
      setMessages(prev => prev.map(m => m.id === msg.message.id ? msg.message : m));
    }
    if (msg.type === 'message_deleted' && msg.conversationId === conversationId) {
      setMessages(prev => prev.map(m => m.id === msg.messageId
        ? { ...m, isDeleted: true, body: '', mediaUrl: '', mediaType: '' } : m));
    }
  });

  async function send() {
    const body = input.trim();
    if (!body) return;
    setInput('');

    if (editingId) {
      // Edit existing message
      try {
        const data = await apiFetch(`/messages/${conversationId}/${editingId}`, {
          method: 'PUT', body: JSON.stringify({ body }),
        });
        setMessages(prev => prev.map(m => m.id === editingId ? data.message : m));
        setEditingId(null);
      } catch (e) { toast(e.message); setInput(body); }
      return;
    }

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

  async function deleteMessage(msgId) {
    Alert.alert('Delete Message', 'Delete this message for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiFetch(`/messages/${conversationId}/${msgId}`, { method: 'DELETE', body: '{}' });
          setMessages(prev => prev.map(m => m.id === msgId
            ? { ...m, isDeleted: true, body: '', mediaUrl: '', mediaType: '' } : m));
        } catch (e) { toast(e.message); }
      }},
    ]);
  }

  function startEdit(msg) {
    setEditingId(msg.id);
    setInput(msg.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setInput('');
  }

  function onLongPress(msg) {
    if (msg.senderId !== user?.userId || msg.isDeleted) return;
    const options = msg.body
      ? ['Edit', 'Delete', 'Cancel']
      : ['Delete', 'Cancel'];
    const destructiveIndex = options.indexOf('Delete');
    const cancelIndex      = options.indexOf('Cancel');

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (i) => {
          if (options[i] === 'Edit')   startEdit(msg);
          if (options[i] === 'Delete') deleteMessage(msg.id);
        },
      );
    } else {
      Alert.alert('Message', undefined, [
        ...(msg.body ? [{ text: 'Edit', onPress: () => startEdit(msg) }] : []),
        { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(msg.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function pickMedia() {
    Alert.alert('Send Media', undefined, [
      { text: 'Photo / Video', onPress: pickImage },
      { text: 'Audio File',    onPress: pickAudio },
      { text: 'Cancel',        style: 'cancel' },
    ]);
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { toast('Photo library access denied'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const ext   = asset.uri.split('.').pop();
    const mime  = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
    await uploadMedia(asset.uri, `media.${ext}`, mime);
  }

  async function pickAudio() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0] || result;
      await uploadMedia(file.uri, file.name || 'audio.mp3', file.mimeType || 'audio/mpeg');
    } catch (e) { toast(e.message); }
  }

  async function uploadMedia(uri, name, mimeType) {
    const token = await getToken();
    const form  = new FormData();
    form.append('file', { uri, name, type: mimeType });
    try {
      const res  = await fetch(`${BASE_URL}/api/messages/${conversationId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessages(prev => [...prev, data.message]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { toast(e.message); }
  }

  function renderMedia(m) {
    if (!m.mediaUrl || m.isDeleted) return null;
    if (m.mediaType === 'image') {
      const { Image } = require('react-native');
      return <Image source={{ uri: m.mediaUrl }} style={s.mediaImg} resizeMode="cover" />;
    }
    // Audio & video shown as links in mobile (expo-av removed)
    return (
      <Text style={s.mediaLink}>
        {m.mediaType === 'audio' ? '🎵' : '🎬'} {m.mediaType === 'audio' ? 'Audio' : 'Video'} attachment
      </Text>
    );
  }

  function renderMsg({ item: m }) {
    const isMine = m.senderId === user?.userId;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(m)}
        delayLongPress={350}
      >
        <View style={[s.msgWrap, isMine ? s.msgWrapMine : s.msgWrapOther]}>
          <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
            {m.isDeleted ? (
              <Text style={[s.msgText, s.deletedText]}>This message was deleted</Text>
            ) : (
              <>
                {renderMedia(m)}
                {!!m.body && (
                  <Text style={[s.msgText, isMine ? s.msgTextMine : s.msgTextOther]}>{m.body}</Text>
                )}
              </>
            )}
            <View style={s.timeLine}>
              <Text style={[s.msgTime, isMine ? { color: 'rgba(255,255,255,0.6)' } : {}]}>
                {fmtTime(m.createdAt)}{m.editedAt ? ' · edited' : ''}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
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
        {/* Edit banner */}
        {editingId && (
          <View style={s.editBanner}>
            <Text style={s.editBannerText} numberOfLines={1}>✏️ Editing message</Text>
            <TouchableOpacity onPress={cancelEdit}><Text style={s.editBannerCancel}>✕ Cancel</Text></TouchableOpacity>
          </View>
        )}
        <View style={s.inputBar}>
          {/* Attach media */}
          <TouchableOpacity onPress={pickMedia} style={s.attachBtn}>
            <Text style={s.attachIcon}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={editingId ? 'Edit message…' : 'Type a message…'}
            placeholderTextColor={Colors.ink4}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity onPress={send} style={[s.sendBtn, editingId && s.sendBtnEdit]}>
            <Text style={s.sendIcon}>{editingId ? '✓' : '↑'}</Text>
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
  safe:          { flex: 1, backgroundColor: Colors.bg },
  list:          { padding: 12, paddingBottom: 8, gap: 6 },
  msgWrap:       { flexDirection: 'row' },
  msgWrapMine:   { justifyContent: 'flex-end' },
  msgWrapOther:  { justifyContent: 'flex-start' },
  bubble:        { maxWidth: '78%', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine:    { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleOther:   { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border2, borderBottomLeftRadius: 4 },
  msgText:       { fontSize: 14, lineHeight: 20 },
  msgTextMine:   { color: Colors.white },
  msgTextOther:  { color: Colors.ink },
  deletedText:   { fontStyle: 'italic', opacity: 0.5, color: Colors.ink3, fontSize: 13 },
  msgTime:       { fontSize: 10, color: Colors.ink4, marginTop: 4, textAlign: 'right' },
  timeLine:      { flexDirection: 'row', justifyContent: 'flex-end' },
  mediaImg:      { width: 180, height: 180, borderRadius: 8, marginBottom: 4 },
  mediaLink:     { fontSize: 13, color: Colors.accent, marginBottom: 4 },
  empty:         { textAlign: 'center', color: Colors.ink4, paddingTop: 40, fontSize: 14 },

  editBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 14, paddingVertical: 6,
                   backgroundColor: Colors.accentBg || Colors.surface, borderTopWidth: 1, borderColor: Colors.border2 },
  editBannerText:{ fontSize: 12, color: Colors.accent, flex: 1 },
  editBannerCancel:{ fontSize: 12, color: Colors.accent, fontWeight: '700', paddingLeft: 12 },

  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderTopWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.surface },
  attachBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  attachIcon:   { fontSize: 20 },
  input:        { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.lg,
                  paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
                  color: Colors.ink, borderWidth: 1, borderColor: Colors.border2, maxHeight: 100 },
  sendBtn:      { width: 40, height: 40, backgroundColor: Colors.accent, borderRadius: 20,
                  alignItems: 'center', justifyContent: 'center' },
  sendBtnEdit:  { backgroundColor: Colors.green || '#16a34a' },
  sendIcon:     { color: Colors.white, fontSize: 18, fontWeight: '700' },
});
