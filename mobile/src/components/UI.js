import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform,
} from 'react-native';
import { Colors, Radius, Shadow } from '../theme';

// ── Button ────────────────────────────────────────────────────────────────────
export function Button({ title, onPress, variant = 'primary', loading, style, textStyle }) {
  const variantStyles = {
    primary: { bg: Colors.accent,  text: Colors.white },
    ghost:   { bg: Colors.surface, text: Colors.accent },
    gold:    { bg: Colors.gold,    text: Colors.white  },
    danger:  { bg: Colors.red,     text: Colors.white  },
  }[variant] || { bg: Colors.accent, text: Colors.white };

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={loading ? undefined : onPress}
      style={[styles.btn, { backgroundColor: variantStyles.bg }, Shadow.sm, style]}
    >
      {loading
        ? <ActivityIndicator color={variantStyles.text} size="small" />
        : <Text style={[styles.btnText, { color: variantStyles.text }, textStyle]}>{title}</Text>
      }
    </TouchableOpacity>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[styles.card, Shadow.sm, style]}>
      {children}
    </View>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ style, ...props }) {
  return (
    <View style={[styles.inputWrap, style]}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <View style={styles.inputBox}>
        <props.Component ?? View />
      </View>
    </View>
  );
}

export function TextField({ label, style, inputStyle, ...props }) {
  const { TextInput } = require('react-native');
  return (
    <View style={[styles.fieldWrap, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={Colors.ink4}
        style={[styles.textInput, inputStyle]}
        {...props}
      />
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

// ── Tag chip ──────────────────────────────────────────────────────────────────
export function Tag({ label, onRemove }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>#{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top:6,bottom:6,left:6,right:6 }}>
          <Text style={styles.tagX}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ uri, initial = '?', size = 36, style }) {
  const { Image } = require('react-native');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial.toUpperCase()}</Text>
      }
    </View>
  );
}

// ── Toast (imperative) ────────────────────────────────────────────────────────
let _toastSetter = null;
export function registerToastSetter(fn) { _toastSetter = fn; }
export function toast(msg, dur = 2800) {
  _toastSetter?.({ msg, dur, key: Date.now() });
}

export function ToastContainer() {
  const [state, setState] = React.useState(null);
  React.useEffect(() => { registerToastSetter(setState); }, []);
  React.useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), state.dur);
    return () => clearTimeout(t);
  }, [state?.key]);
  if (!state) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{state.msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 20, paddingVertical: 13,
    borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center',
  },
  btnText: {
    fontSize: 15, fontWeight: '700', letterSpacing: 0.2,
  },
  card: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.ink2,
    marginBottom: 6, fontFamily: Platform.select({ ios: 'System', android: 'Roboto' }),
  },
  textInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5,
    borderColor: Colors.border2, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: Colors.ink, fontFamily: Platform.select({ ios: 'System', android: 'Roboto' }),
  },
  divider: {
    height: 1, backgroundColor: Colors.border2, marginVertical: 16,
  },
  tag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.accentBg, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.accentRing,
  },
  tagText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  tagX:    { fontSize: 14, color: Colors.accent, marginLeft: 4, lineHeight: 16 },
  avatar: {
    backgroundColor: Colors.accentBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.accentRing, overflow: 'hidden',
  },
  avatarText: { color: Colors.accent, fontWeight: '700' },
  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingHorizontal: 18, paddingVertical: 10,
    zIndex: 9999, maxWidth: '85%',
  },
  toastText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  inputWrap: {},
  inputLabel: {},
  inputBox: {},
});
