import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  ScrollView, PanResponder, Animated, ImageBackground, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Typography } from '../../theme';
import { Avatar, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { width: W } = Dimensions.get('window');
const EMOJIS = ['❤️','😂','😢','😮','😍','🙏','👏','🔥','🎉','😆'];

export default function NoteDetailScreen({ route, navigation }) {
  const { noteId, notes: initialNotes = [] } = route.params;
  const { user } = useAuth();

  const [notes, setNotes]       = useState(initialNotes);
  const [idx, setIdx]           = useState(() => initialNotes.findIndex(n => n.id === noteId) ?? 0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replies, setReplies]   = useState([]);
  const [replyText, setReplyText] = useState('');
  const [showReplies, setShowReplies] = useState(false);

  const note = notes[idx];

  useEffect(() => {
    if (!note) return;
    fetchReplies();
  }, [note?.id]);

  async function fetchReplies() {
    try {
      const data = await apiFetch(`/notes/${note.id}/replies`);
      setReplies(data.replies || []);
    } catch {}
  }

  async function react(emoji) {
    setShowEmoji(false);
    try {
      await apiFetch(`/notes/${note.id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
      toast(`${emoji} reacted!`);
    } catch (e) { toast(e.message); }
  }

  async function sendReply() {
    if (!replyText.trim()) return;
    try {
      await apiFetch(`/notes/${note.id}/replies`, { method: 'POST', body: JSON.stringify({ text: replyText.trim() }) });
      setReplyText('');
      fetchReplies();
    } catch (e) { toast(e.message); }
  }

  const isOwner = user && note && user.userId === note.userId;

  function goNext() { if (idx < notes.length - 1) { setShowEmoji(false); setIdx(i => i + 1); } }
  function goPrev() { if (idx > 0) { setShowEmoji(false); setIdx(i => i - 1); } }

  if (!note) return (
    <SafeAreaView style={s.safe}><Text style={{ color: Colors.ink4, textAlign: 'center', marginTop: 40 }}>Note not found</Text></SafeAreaView>
  );

  const palette = PALETTE[note.colorIdx ?? 0] ?? PALETTE[0];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Story progress bars */}
      <View style={s.bars}>
        {notes.map((_, i) => (
          <View key={i} style={[s.bar, { flex: 1 }]}>
            <View style={[s.barFill, { backgroundColor: i <= idx ? Colors.white : 'rgba(255,255,255,0.3)' }]} />
          </View>
        ))}
      </View>

      {/* Card */}
      <ImageBackground
        source={note.bgUrl ? { uri: note.bgUrl } : undefined}
        style={[s.card, { backgroundColor: palette.bg }]}
        imageStyle={{ borderRadius: 0 }}
      >
        <View style={[s.cardOverlay, note.bgUrl && { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          {/* Header row */}
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
            <Text style={[s.dateText, { color: palette.accent + '99' }]}>{fmtDate(note.createdAt)}</Text>
            {isOwner && (
              <TouchableOpacity onPress={() => navigation.navigate('NoteForm', { note })}>
                <Text style={[s.editBtn, { color: palette.accent }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Content — scrollable */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {note.title ? <Text style={[s.title, { color: palette.accent, fontFamily: Typography.serifB }]}>{note.title}</Text> : null}
            <Text style={[s.body, { color: palette.accent + 'dd', fontSize: note.fontSize ?? 15 }]}>{note.body}</Text>
          </ScrollView>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity onPress={() => setShowEmoji(v => !v)} style={s.actionBtn}>
              <Text style={s.actionText}>♡ {note.reactionCount || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReplies(v => !v)} style={s.actionBtn}>
              <Text style={s.actionText}>💬 {replies.length}</Text>
            </TouchableOpacity>
            {note.isPublic && <Text style={[s.actionText, { color: Colors.ink5 }]}>🌍 Public</Text>}
          </View>

          {/* Emoji picker */}
          {showEmoji && (
            <View style={s.emojiRow}>
              {EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => react(e)} style={s.emojiBtn}>
                  <Text style={s.emoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Tap zones for prev/next */}
          <TouchableOpacity style={s.tapLeft}  onPress={goPrev} />
          <TouchableOpacity style={s.tapRight} onPress={goNext} />
        </View>
      </ImageBackground>

      {/* Replies panel */}
      {showReplies && (
        <View style={s.repliesPanel}>
          <ScrollView style={{ maxHeight: 220 }}>
            {replies.map(r => (
              <View key={r.id} style={s.reply}>
                <Text style={s.replyName}>{r.displayName || r.name}</Text>
                <Text style={s.replyText}>{r.text}</Text>
              </View>
            ))}
            {!replies.length && <Text style={s.emptyReplies}>No comments yet. Be the first!</Text>}
          </ScrollView>
          <View style={s.replyInput}>
            <View style={s.replyInputBox}>
              <Text
                style={s.replyPlaceholder}
                onPress={() => {/* handled by RN's onPress on wrapping view */}}
              >{replyText || 'Add a comment…'}</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const PALETTE = [
  { bg: '#2a1f14', accent: '#d4a96a' },
  { bg: '#12202e', accent: '#5b9bd5' },
  { bg: '#112214', accent: '#4caf7a' },
  { bg: '#28121e', accent: '#d55b7f' },
  { bg: '#28220c', accent: '#c9a020' },
  { bg: '#1c1228', accent: '#8b5bd5' },
  { bg: '#0f2222', accent: '#1aadad' },
  { bg: '#26150e', accent: '#cc5a35' },
];

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#000' },
  bars:       { flexDirection: 'row', gap: 3, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4, position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10 },
  bar:        { height: 2.5, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.3)' },
  barFill:    { height: '100%', borderRadius: 2 },
  card:       { flex: 1 },
  cardOverlay:{ flex: 1, paddingTop: 62, paddingHorizontal: 20 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  closeBtn:   { color: Colors.white, fontSize: 18, fontWeight: '700' },
  dateText:   { fontSize: 12 },
  editBtn:    { fontSize: 13, fontWeight: '600' },
  title:      { fontSize: 26, fontWeight: '700', marginBottom: 16, lineHeight: 34 },
  body:       { lineHeight: 26, letterSpacing: 0.2, marginBottom: 20 },
  actions:    { flexDirection: 'row', gap: 16, paddingBottom: 10, paddingTop: 8, borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  actionBtn:  { paddingVertical: 6 },
  actionText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  emojiRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  emojiBtn:   { padding: 6 },
  emoji:      { fontSize: 26 },
  tapLeft:    { position: 'absolute', left: 0, top: 62, bottom: 120, width: '35%' },
  tapRight:   { position: 'absolute', right: 0, top: 62, bottom: 120, width: '35%' },
  repliesPanel:{ backgroundColor: Colors.surface2, borderTopWidth: 1, borderColor: Colors.border2, padding: 14 },
  reply:      { marginBottom: 10 },
  replyName:  { fontSize: 12, fontWeight: '700', color: Colors.ink2, marginBottom: 2 },
  replyText:  { fontSize: 13, color: Colors.ink3, lineHeight: 18 },
  emptyReplies:{ color: Colors.ink4, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  replyInput: { flexDirection: 'row', gap: 8, marginTop: 10 },
  replyInputBox:{ flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: Colors.border2 },
  replyPlaceholder:{ color: Colors.ink4, fontSize: 13 },
});
