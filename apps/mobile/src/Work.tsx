import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSession, request } from './api';
import type { CommerceOrder, CrmTask } from './models';
import { calendar, ORDER_LABELS, ORDER_TRANSITIONS } from './models';
import { Banner, C, IconButton, Pill, Placeholder, PrimaryButton, RoundAvatar } from './ui';

export function TasksScreen({ onExpired }: { onExpired: () => void }) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request<{ items: CrmTask[] }>('/crm/tasks?status=open&limit=50');
      setTasks(result.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المهام');
      if (!getSession()) onExpired();
    } finally { setLoading(false); }
  }, [onExpired]);
  useEffect(() => { void reload(); }, [reload]);
  async function finish(task: CrmTask) {
    setBusy(task.id);
    try {
      await request('/crm/tasks/' + task.id, 'PATCH', { status: 'done', expectedUpdatedAt: (task as CrmTask & { updated_at?: string }).updated_at });
      await reload();
    } catch (e) { Alert.alert('تعذر إنهاء المهمة', e instanceof Error ? e.message : 'حاول مجددًا'); }
    finally { setBusy(null); }
  }
  return <View style={s.page}>
    <View style={s.header}><IconButton name="refresh" color="white" onPress={() => void reload()} /><Text style={s.headerTitle}>مهام الفريق</Text></View>
    {error ? <Banner text={error} danger /> : null}
    <FlatList data={tasks} keyExtractor={t => t.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
      contentContainerStyle={s.list}
      ListEmptyComponent={!loading ? <Placeholder text="مافيش مهام مفتوحة حالياً" action="تحديث" onPress={() => void reload()} /> : null}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.cardHeading}>
          <View style={[s.priority, { backgroundColor: item.priority === 'high' ? '#FFE4E2' : '#EAF1ED' }]}>
            <Text style={{ color: item.priority === 'high' ? C.red : C.green, fontSize: 12, fontWeight: '700' }}>
              {item.priority === 'high' ? 'عاجلة' : 'عادية'}
            </Text>
          </View>
          <Text style={s.cardTitle}>{item.title}</Text>
        </View>
        <Text style={s.secondary}>{item.contact_name || 'مهمة داخلية'}</Text>
        <View style={s.cardBottom}>
          <PrimaryButton title={busy === item.id ? 'جارٍ الحفظ...' : 'إنهاء المهمة'} disabled={Boolean(busy)} onPress={() => void finish(item)} />
          <Text style={s.secondary}>الموعد: {calendar(item.due_at)}</Text>
        </View>
      </View>} />
  </View>;
}

export function OrdersScreen({ onExpired }: { onExpired: () => void }) {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<CommerceOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await request<CommerceOrder[]>('/commerce/orders?page=1');
      setOrders(items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الطلبات');
      if (!getSession()) onExpired();
    } finally { setLoading(false); }
  }, [onExpired]);
  useEffect(() => { void reload(); }, [reload]);

  async function changeStatus(order: CommerceOrder, status: string) {
    setBusy(true);
    try {
      await request('/commerce/orders/' + order.id + '/status', 'PATCH', { status });
      setCurrent(null);
      await reload();
    } catch (e) { Alert.alert('تعذر تغيير الحالة', e instanceof Error ? e.message : 'تحقق من مسار الطلب'); }
    finally { setBusy(false); }
  }
  const statuses = current ? ORDER_TRANSITIONS[current.status] || [] : [];
  return <View style={s.page}>
    <View style={s.header}><IconButton name="refresh" color="white" onPress={() => void reload()} /><Text style={s.headerTitle}>الطلبات</Text></View>
    {error ? <Banner text={error} danger /> : null}
    <FlatList data={orders} keyExtractor={o => o.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
      contentContainerStyle={s.list}
      ListEmptyComponent={!loading ? <Placeholder text="لا توجد طلبات حاليًا" action="تحديث" onPress={() => void reload()} /> : null}
      renderItem={({ item }) => <Pressable style={s.card} onPress={() => setCurrent(item)}>
        <View style={s.cardHeading}>
          <View style={[s.priority, { backgroundColor: '#E6F2EC' }]}><Text style={{ color: C.green, fontSize: 12 }}>{ORDER_LABELS[item.status] || item.status}</Text></View>
          <Text numberOfLines={2} style={s.cardTitle}>{item.snapshot?.name || 'طلب جديد'}</Text>
        </View>
        <Text style={s.secondary}>{item.contact_name}</Text>
        <View style={s.cardBottom}>
          <Ionicons name="chevron-back" size={20} color={C.green} />
          <Text style={s.secondary}>{calendar(item.created_at)} · {item.assignee_name || 'غير مسند'}</Text>
        </View>
      </Pressable>} />
    {current && <View style={s.sheetBackdrop}>
      <View style={s.sheet}>
        <View style={s.cardHeading}>
          <IconButton name="close" onPress={() => setCurrent(null)} />
          <Text style={[s.cardTitle, { fontSize: 19 }]}>تحديث الطلب</Text>
        </View>
        <Text style={{ color: C.muted, textAlign: 'right', marginTop: 10 }}>{current.contact_name}</Text>
        <Text style={[s.cardTitle, { marginTop: 5 }]}>{current.snapshot?.name || 'طلب'}</Text>
        <Text style={{ color: C.green, textAlign: 'right', marginTop: 12 }}>الحالة الحالية: {ORDER_LABELS[current.status] || current.status}</Text>
        <Text style={{ color: C.ink, textAlign: 'right', marginTop: 18, fontWeight: '800' }}>نقل الطلب إلى</Text>
        <ScrollView style={{ maxHeight: 250 }}>
          {statuses.map(status => <Pressable key={status} disabled={busy} style={s.option} onPress={() => void changeStatus(current, status)}>
            <Ionicons name="arrow-back" color={C.green} size={18} />
            <Text style={{ color: C.ink, fontSize: 15 }}>{ORDER_LABELS[status] || status}</Text>
          </Pressable>)}
          {!statuses.length && <Text style={s.secondary}>الطلب في حالة نهائية، لا توجد انتقالات متاحة</Text>}
        </ScrollView>
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.background },
  header: { backgroundColor: C.green, paddingHorizontal: 15, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '800' },
  list: { padding: 12, flexGrow: 1, paddingBottom: 24 },
  card: { backgroundColor: 'white', borderRadius: 17, padding: 16, marginBottom: 11, borderWidth: 1, borderColor: C.line, gap: 10 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink, textAlign: 'right' },
  priority: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12 },
  secondary: { fontSize: 13, color: C.muted, textAlign: 'right' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, backgroundColor: '#0007', justifyContent: 'flex-end', zIndex: 50 },
  sheet: { padding: 19, paddingBottom: 36, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
