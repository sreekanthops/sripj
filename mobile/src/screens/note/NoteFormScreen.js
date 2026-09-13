import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../../theme';
import { Button, TextField, Divider, Tag, toast } from '../../components/UI';
import { apiFetch } from '../../api/client';

const BODY_FONTS = [
  { label: 'Kalam',     value: "'Kalam',cursive" },
  { label: 'Georgia',   value: 'Georgia,serif'   },
  { label: 'Palatino',  value: "'Palatino Linotype',serif" },
  { label: 'Courier',   value: "'Courier New',monospace" },
  { label: 'Arial',     value: 'Arial,sans-serif'         },
  { label: 'Caveat',    value: "'Caveat',cursive"         },
];

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

export default function NoteFormScreen({ route, navigation }) {
  const { note } = route.params ?? {};
  const isEdit = !!note;

  const [title, setTitle]     = useState(note?.title || '');
  const [body, setBody]       = useState(note?.body  || '');
  const [font, setFont]       = useState(note?.font  || "'Kalam',cursive");
  const [fontSize, setFontSize] = useState(note?.fontSize || 14);
  const [colorIdx, setColorIdx] = useState(note?.colorIdx ?? 0);
  const [isPublic, setIsPublic] = useState(note?.isPublic ?? false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags]         = useState(note?.tags || []);
  const [saving, setSaving]     = useState(false);

  function addTag(raw) {
    const t = raw.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  }

  async function save() {
    if (!title.trim() && !body.trim()) { toast('Add a title or content'); return; }
    setSaving(true);
    try {
      const payload = { title, body, font, fontSize, colorIdx, tags, isPublic };
      if (isEdit) {
        await apiFetch(`/notes/${note.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Entry updated ✅');
      } else {
        await apiFetch('/notes', { method: 'POST', body: JSON.stringify(payload) });
        toast('Entry saved ✅');
      }
      navigation.goBack();
    } catch (e) {
      toast(e.message);
    } finally { setSaving(false); }
  }

  async function deleteNote() {
    Alert.alert('Delete Entry', 'This cannot be undone. Delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiFetch(`/notes/${note.id}`, { method: 'DELETE' });
          toast('Entry deleted');
          navigation.goBack();
        } catch (e) { toast(e.message); }
      }},
    ]);
  }

  const palette = PALETTE[colorIdx];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Nav row */}
          <View style={s.nav}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={s.navCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>{isEdit ? 'Edit Entry' : 'New Entry'}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.accent} /> : <Text style={s.navSave}>Save</Text>}
            </TouchableOpacity>
          </View>

          {/* Title */}
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Give your entry a title…" />

          {/* Colour palette */}
          <Text style={s.sectionLabel}>Colour Theme</Text>
          <View style={s.paletteRow}>
            {PALETTE.map((p, i) => (
              <TouchableOpacity key={i} onPress={() => setColorIdx(i)}
                style={[s.paletteSwatch, { backgroundColor: p.bg }, colorIdx === i && s.paletteSwatchActive]}
              />
            ))}
          </View>

          {/* Body font */}
          <Text style={s.sectionLabel}>Font Style</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {BODY_FONTS.map(f => (
              <TouchableOpacity key={f.value} onPress={() => setFont(f.value)}
                style={[s.fontChip, font === f.value && s.fontChipActive]}
              >
                <Text style={[s.fontChipText, font === f.value && s.fontChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Content */}
          <TextField
            label="Content"
            value={body} onChangeText={setBody}
            placeholder="Write your thoughts…"
            multiline
            inputStyle={{ minHeight: 180, textAlignVertical: 'top' }}
          />

          {/* Tags */}
          <Text style={s.sectionLabel}>Tags</Text>
          <View style={s.tagRow}>
            {tags.map(t => <Tag key={t} label={t} onRemove={() => setTags(prev => prev.filter(x => x !== t))} />)}
          </View>
          <TextField
            value={tagInput} onChangeText={setTagInput}
            placeholder="Add tag (press Enter)"
            onSubmitEditing={() => addTag(tagInput)}
            returnKeyType="done"
            style={{ marginBottom: 14 }}
          />

          <Divider />

          {/* Share to feed toggle */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>🌍 Share to Feed</Text>
              <Text style={s.toggleSub}>Visible to everyone in the public feed</Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: Colors.border3, true: Colors.accentRing }}
              thumbColor={isPublic ? Colors.accent : Colors.ink5}
            />
          </View>

          {/* Preview */}
          <View style={[s.preview, { backgroundColor: palette.bg }]}>
            <Text style={[s.previewTitle, { color: palette.accent }]} numberOfLines={1}>{title || 'Title preview…'}</Text>
            <Text style={[s.previewBody, { color: palette.accent + 'cc' }]} numberOfLines={3}>{body || 'Your story will look like this…'}</Text>
          </View>

          {isEdit && (
            <>
              <Divider />
              <Button title="Delete Entry" variant="danger" onPress={deleteNote} style={{ marginTop: 4 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  scroll:         { padding: 16, paddingBottom: 60 },
  nav:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navCancel:      { color: Colors.ink3, fontSize: 15 },
  navTitle:       { fontSize: 16, fontWeight: '700', color: Colors.ink },
  navSave:        { color: Colors.accent, fontSize: 15, fontWeight: '700' },
  sectionLabel:   { fontSize: 12, fontWeight: '600', color: Colors.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  paletteRow:     { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  paletteSwatch:  { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent' },
  paletteSwatchActive: { borderColor: Colors.gold, transform: [{ scale: 1.2 }] },
  fontChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, marginRight: 8 },
  fontChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  fontChipText:   { fontSize: 13, color: Colors.ink3, fontWeight: '600' },
  fontChipTextActive:{ color: Colors.white },
  tagRow:         { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  toggleLabel:    { fontSize: 15, fontWeight: '600', color: Colors.ink },
  toggleSub:      { fontSize: 12, color: Colors.ink4, marginTop: 2 },
  preview:        { borderRadius: Radius.lg, padding: 16, marginTop: 16, minHeight: 90 },
  previewTitle:   { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  previewBody:    { fontSize: 13, lineHeight: 20 },
});
