import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '../../theme';
import { Avatar } from '../../components/UI';
import { apiFetch } from '../../api/client';

export default function UserListScreen({ route, navigation }) {
  const { userId, type } = route.params; // type = 'followers' | 'following'
  const [users, setUsers]       = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const data = await apiFetch(`/follows/${userId}/${type}`);
      setUsers(data.users || []);
    } catch {}
    setRefreshing(false);
  }

  useEffect(() => {
    navigation.setOptions({ title: type === 'followers' ? 'Followers' : 'Following' });
    load();
  }, [userId, type]);

  function renderUser({ item: u }) {
    const initial = (u.displayName || u.username || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => navigation.navigate('UserProfile', { userId: u.id })}
      >
        <Avatar uri={u.avatarUrl} initial={initial} size={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.name}>{u.displayName || u.username}</Text>
          <Text style={s.handle}>@{u.username}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FlatList
        data={users}
        keyExtractor={u => u.id}
        renderItem={renderUser}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No {type} yet.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  list:   { paddingBottom: 80 },
  row:    { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: Colors.border },
  name:   { fontSize: 14, fontWeight: '700', color: Colors.ink },
  handle: { fontSize: 12, color: Colors.ink4, marginTop: 1 },
  empty:  { textAlign: 'center', color: Colors.ink4, padding: 40, fontSize: 14 },
});
