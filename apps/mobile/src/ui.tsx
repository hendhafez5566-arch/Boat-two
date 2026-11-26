import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = {
  green: '#075E54',
  greenDark: '#064B45',
  accent: '#128C7E',
  lime: '#25D366',
  outgoing: '#D9FDD3',
  wallpaper: '#EAE6DE',
  white: '#FFFFFF',
  background: '#F7F9F8',
  muted: '#667781',
  ink: '#142B28',
  line: '#E8EDEA',
  blue: '#2683D3',
  red: '#C74747',
};

export function IconButton({ name, onPress, color = C.green, size = 22, disabled = false }: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void; color?: string; size?: number; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.iconButton, pressed && { opacity: .65 }]}>
    <Ionicons name={name} size={size} color={disabled ? '#B5BFBA' : color} />
  </Pressable>;
}

export function RoundAvatar({ name, size = 52 }: { name?: string; size?: number }) {
  const letters = (name || '؟').trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0)).join('').toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D9EDE7', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: C.green, fontSize: Math.round(size * .32), fontWeight: '800' }}>{letters}</Text>
  </View>;
}

export function Pill({ children, selected, onPress }: {
  children: React.ReactNode; selected?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={[styles.pill, selected && styles.pillSelected]}>
    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{children}</Text>
  </Pressable>;
}

export function PrimaryButton({ title, onPress, loading = false, disabled = false }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={loading || disabled} onPress={onPress}
    style={[styles.primary, (loading || disabled) && { opacity: .5 }]}>
    {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryLabel}>{title}</Text>}
  </Pressable>;
}

export function Placeholder({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) {
  return <View style={styles.placeholder}>
    <Ionicons name="chatbubble-ellipses-outline" size={40} color="#A9C5BA" />
    <Text style={styles.placeholderText}>{text}</Text>
    {action && onPress && <PrimaryButton title={action} onPress={onPress} />}
  </View>;
}

export function Banner({ text, danger = false }: { text: string; danger?: boolean }) {
  return <View style={{ padding: 11, backgroundColor: danger ? '#FFF0EF' : '#E6F4EF', borderRadius: 10, margin: 10 }}>
    <Text style={{ color: danger ? C.red : C.green, textAlign: 'center', fontSize: 13 }}>{text}</Text>
  </View>;
}

export const styles = StyleSheet.create({
  iconButton: { padding: 10, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  pill: { backgroundColor: '#F1F5F2', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 9, marginRight: 8 },
  pillSelected: { backgroundColor: '#D2EFE1' },
  pillText: { color: '#52645E', fontWeight: '600', fontSize: 13 },
  pillTextSelected: { color: C.green, fontWeight: '800' },
  primary: { backgroundColor: C.green, paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center', borderRadius: 14, minWidth: 116 },
  primaryLabel: { color: 'white', fontSize: 15, fontWeight: '800' },
  placeholder: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 35, gap: 16 },
  placeholderText: { color: C.muted, lineHeight: 24, fontSize: 14, textAlign: 'center' },
});
