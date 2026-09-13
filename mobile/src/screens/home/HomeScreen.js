import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Image, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Typography } from '../../theme';
import { Avatar } from '../../components/UI';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const TIME_FILTERS = [
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'Monthly'   },
  { key: 'year',  label: 'Yearly'    },
  { key: 'all',   label: 'Show All'  },
];

export default function HomeScreen({ navigation }) {
  const { user }              = useAuth();
  const [notes, setNotes]     = useState([]);
  const [tf, setTf]           = useState('week');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await apiFetch(`/notes?tf=${tf}`);
      setNotes(data.notes || data || []);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [tf]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const onRefresh = () => { setRefreshing(true); fetchNotes(); };

  function renderNote({ item: n }) {
    const palette = PALETTE[n.colorIdx ?? 0] ?? PALETTE[0];
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: palette.bg }, Shadow.sm]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('NoteDetail', { noteId: n.id, notes })}
      >
        {n.bgUrl ? (
          <ImageBackground source={{ uri: n.bgUrl }} style={s.cardBg} imageStyle={{ borderRadius: Radius.lg }}>
            <View style={[s.cardOverlay]}>
              <NoteCardContent n={n} palette={palette} />
            </View>
          </ImageBackground>
        ) : (
          <NoteCardContent n={n} palette={palette} />
        )}
        {n.isPublic && <Text style={s.publicBadge}>🌍</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.heroTitle}>✦ Unsent Stories</Text>
          <Text style={s.heroSub}>about {user?.displayName || user?.username || 'you'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('NoteForm', {})} style={s.newBtn}>
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Time filter pills */}
      <View style={s.pills}>
        {TIME_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.pill, tf === f.key && s.pillActive]}
            onPress={() => setTf(f.key)}
          >
            <Text style={[s.pillText, tf === f.key && s.pillTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notes grid */}
      <FlatList
        data={notes}
        keyExtractor={n => n.id}
        renderItem={renderNote}
        numColumns={2}
        contentContainerStyle={s.grid}
        columnWrapperStyle={{ gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={s.empty}>
              <Text style={s.emptyText}>No entries yet for this period.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('NoteForm', {})} style={{ marginTop: 12 }}>
                <Text style={[s.emptyText, { color: Colors.accent, fontWeight: '700' }]}>Write your first entry →</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function NoteCardContent({ n, palette }) {
  return (
    <View style={s.cardInner}>
      {n.title ? <Text style={[s.cardTitle, { color: palette.accent, fontFamily: Typography.serifB }]} numberOfLines={2}>{n.title}</Text> : null}
      {n.body  ? <Text style={[s.cardBody, { color: palette.accent + 'cc' }]} numberOfLines={4}>{n.body}</Text> : null}
      <View style={s.cardFoot}>
        <Text style={[s.cardDate, { color: palette.accent + '88' }]}>{fmtDate(n.createdAt)}</Text>
        {n.reactionCount > 0 && <Text style={[s.cardReact, { color: palette.accent + '88' }]}>♡ {n.reactionCount}</Text>}
      </View>
    </View>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
  safe:         { flex: 1, backgroundColor: Colors.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  heroTitle:    { fontSize: 20, fontWeight: '800', color: Colors.ink, fontStyle: 'italic' },
  heroSub:      { fontSize: 12, color: Colors.ink4, marginTop: 2 },
  newBtn:       { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full },
  newBtnText:   { color: Colors.white, fontSize: 13, fontWeight: '700' },
  pills:        { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 10 },
  pill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2 },
  pillActive:   { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillText:     { fontSize: 12, fontWeight: '600', color: Colors.ink3 },
  pillTextActive:{ color: Colors.white },
  grid:         { paddingHorizontal: 12, paddingBottom: 100 },
  card:         { flex: 1, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 10, minHeight: 160 },
  cardBg:       { flex: 1 },
  cardOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: Radius.lg },
  cardInner:    { padding: 14, flex: 1, justifyContent: 'space-between' },
  cardTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 6, lineHeight: 20 },
  cardBody:     { fontSize: 12, lineHeight: 18, flex: 1 },
  cardFoot:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cardDate:     { fontSize: 10 },
  cardReact:    { fontSize: 10 },
  publicBadge:  { position: 'absolute', top: 8, right: 8, fontSize: 14 },
  empty:        { alignItems: 'center', paddingTop: 60 },
  emptyText:    { color: Colors.ink4, fontSize: 14, textAlign: 'center' },
});
