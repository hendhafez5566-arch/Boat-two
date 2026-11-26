import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSession, request } from './api';
import type { Conversation, ConversationDetail, Message } from './models';
import { calendar, channelName, clock, messagePreview } from './models';
import { Banner, C, IconButton, Pill, Placeholder, RoundAvatar } from './ui';

type InboxFilter = 'all' | 'mine' | 'unread' | 'unassigned' | 'bot';
const filters: { id: InboxFilter; name: string; query: string }[] = [
  { id: 'all', name: 'الكل', query: 'status=active' },
  { id: 'mine', name: 'محادثاتي', query: 'status=active&assignee=me' },
  { id: 'unread', name: 'غير مقروء', query: 'status=active&unread=true' },
  { id: 'unassigned', name: 'بدون موظف', query: 'status=active&assignee=unassigned' },
  { id: 'bot', name: 'عند البوت', query: 'status=active&handledBy=bot' },
];

function channelColor(type: string) {
  return type === 'whatsapp' ? '#21A659' : type === 'telegram' ? '#2AABEE' : type === 'instagram' ? '#D86DA4' : '#4C91C9';
}

export function ChatList({ onOpen, onExpired, initialFilter = 'mine' }: { onOpen: (item: Conversation) => void; onExpired: () => void; initialFilter?: InboxFilter }) {
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(async (more = false) => {
    if (more && !cursor) return;
    if (!more) setRefreshing(true); else setLoadingMore(true);
    try {
      const selected = filters.find(x => x.id === filter) || filters[0];
      const q = new URLSearchParams(selected.query);
      if (search.trim()) q.set('q', search.trim());
      q.set('limit', '40');
      if (more && cursor) q.set('cursor', cursor);
      const result = await request<{ items: Conversation[]; nextCursor: string | null }>('/conversations?' + q.toString());
      setItems(previous => more ? [...previous, ...result.items.filter(item => !previous.some(p => p.id === item.id))] : result.items);
      setCursor(result.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات');
      if (!getSession()) onExpired();
    } finally { setRefreshing(false); setLoadingMore(false); }
  }, [filter, search, cursor, onExpired]);

  // The first-page timer must not depend on the pagination cursor: don't reset the timer after every load.
  const loadFirst = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const selected = filters.find(x => x.id === filter) || filters[0];
      const q = new URLSearchParams(selected.query);
      if (search.trim()) q.set('q', search.trim());
      q.set('limit', '40');
      const result = await request<{ items: Conversation[]; nextCursor: string | null }>('/conversations?' + q.toString());
      setItems(result.items);
      setCursor(result.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات');
      if (!getSession()) onExpired();
    } finally { if (!silent) setRefreshing(false); }
  }, [filter, search, onExpired]);

  useEffect(() => {
    void loadFirst();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void loadFirst(true); }, 7000);
    return () => clearInterval(timer);
  }, [loadFirst]);

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={'فتح محادثة ' + item.contact_name}
      onPress={() => onOpen(item)} style={s.chatItem}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.chatTitleRow}>
          <Text numberOfLines={1} style={s.chatTitle}>{item.contact_name || item.contact_phone || 'عميل'}</Text>
          {item.important && <Ionicons name="star" color="#E3A53E" size={14} />}
        </View>
        <View style={s.previewLine}>
          <View style={[s.channelDot, { backgroundColor: channelColor(item.channel_type) }]} />
          <Text numberOfLines={1} style={s.preview}>{messagePreview(item.last_message) || channelName(item.channel_type)}</Text>
        </View>
        <Text style={s.agentLine}>{item.handled_by === 'bot' ? '🤖 البوت' : (item.assignee_name || 'بانتظار الموظف')} · {channelName(item.channel_type)}</Text>
      </View>
      <View style={s.chatMeta}>
        <Text style={{ color: item.unread_count > 0 ? C.accent : C.muted, fontSize: 11 }}>{calendar(item.last_message_at)}</Text>
        <Text style={{ color: item.unread_count > 0 ? C.accent : C.muted, fontSize: 11 }}>{clock(item.last_message_at)}</Text>
        {item.unread_count > 0 && <View style={s.unread}><Text style={s.unreadText}>{Math.min(item.unread_count, 99)}</Text></View>}
      </View>
      <RoundAvatar name={item.contact_name} size={54} />
    </Pressable>
  );

  return <View style={s.page}>
    <View style={s.listHeading}>
      <Text style={s.heading}>المحادثات</Text>
      <View style={{ flexDirection: 'row' }}>
        <IconButton name="refresh-outline" color="white" onPress={() => void loadFirst()} />
      </View>
    </View>
    <View style={s.searchBox}>
      <Ionicons name="search-outline" size={20} color={C.muted} />
      <TextInput value={search} onChangeText={setSearch} placeholder="ابحث بالاسم أو رقم الهاتف..."
        placeholderTextColor="#85928D" style={s.searchInput} textAlign="right"
        accessibilityLabel="البحث في المحادثات" />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
      {filters.map(f => <Pill key={f.id} selected={f.id === filter} onPress={() => { setCursor(null); setFilter(f.id); }}>{f.name}</Pill>)}
    </ScrollView>
    {error ? <Banner text={error} danger /> : null}
    <FlatList data={items} keyExtractor={item => item.id} renderItem={renderConversation}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirst()} tintColor={C.green} />}
      ListEmptyComponent={!refreshing ? <Placeholder text="لا توجد محادثات ضمن هذا الفلتر" action="تحديث" onPress={() => void loadFirst()} /> : null}
      ListFooterComponent={cursor ? <Pressable disabled={loadingMore} onPress={() => void load(true)} style={s.loadOlder}>
        <Text style={{ color: C.green }}>{loadingMore ? 'جارٍ التحميل...' : 'عرض محادثات أكثر'}</Text>
      </Pressable> : null}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }} />
  </View>;
}

function MessageBubble({ item }: { item: Message }) {
  if (item.is_internal || item.type === 'event') {
    return <View style={s.eventWrap}><Text style={s.eventText}>{messagePreview(item.content) || 'تحديث داخلي'}</Text></View>;
  }
  const mine = item.direction === 'out';
  const content = item.content || {};
  return <View style={[s.bubbleRow, mine ? s.bubbleMineRow : s.bubbleOtherRow]}>
    <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
      {content.text ? <Text style={s.bubbleText}>{content.text}</Text> : null}
      {content.media ? <View style={s.mediaHint}>
        <Ionicons name={content.media.kind === 'audio' ? 'mic-outline' : content.media.kind === 'image' ? 'image-outline' : 'attach-outline'} size={17} color={C.green} />
        <Text style={{ color: C.green, marginLeft: 5 }}>{messagePreview(content)}</Text>
      </View> : null}
      {!content.text && !content.media && <Text style={s.bubbleText}>{messagePreview(content)}</Text>}
      <View style={s.bubbleFooter}>
        <Text style={s.bubbleTime}>{clock(item.created_at)}</Text>
        {mine && <Ionicons name={item.status === 'read' ? 'checkmark-done' : 'checkmark'} size={14} color={item.status === 'read' ? '#44A2D8' : C.muted} />}
      </View>
    </View>
  </View>;
}

export function ChatRoom({ conversation, onBack, onExpired }: {
  conversation: Conversation; onBack: () => void; onExpired: () => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const nearBottom = useRef(true);
  const id = conversation.id;

  const reload = useCallback(async () => {
    try {
      const [info, page] = await Promise.all([
        request<ConversationDetail>('/conversations/' + id),
        request<{ items: Message[]; hasMore: boolean }>('/conversations/' + id + '/messages?limit=100'),
      ]);
      setDetail(info);
      setMessages(page.items);
      setHasMore(page.hasMore);
      setNotice('');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تحميل الرسائل');
      if (!getSession()) onExpired();
    }
  }, [id, onExpired]);

  useEffect(() => {
    void reload();
    void request('/conversations/' + id + '/read', 'POST').catch(() => undefined);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 4000);
    return () => clearInterval(timer);
  }, [id, reload]);

  async function older() {
    if (!hasMore || !messages[0] || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await request<{ items: Message[]; hasMore: boolean }>(
        '/conversations/' + id + '/messages?limit=100&beforeSeq=' + messages[0].seq,
      );
      setMessages(current => [...page.items.filter(item => !current.some(m => m.id === item.id)), ...current]);
      setHasMore(page.hasMore);
    } catch (e) { Alert.alert('تعذر التحميل', String(e)); }
    finally { setLoadingOlder(false); }
  }

  const whatsappExpired = detail?.channel_type === 'whatsapp' &&
    (!detail.whatsapp_window_expires_at || new Date(detail.whatsapp_window_expires_at).getTime() <= Date.now());

  async function submit() {
    const text = reply.trim();
    if (!text || sending || whatsappExpired) return;
    setSending(true);
    try {
      await request('/conversations/' + id + '/messages', 'POST', { text });
      setReply('');
      await reload();
      list.current?.scrollToEnd({ animated: true });
    } catch (e) {
      Alert.alert('لم تُرسل الرسالة', e instanceof Error ? e.message : 'راجع الاتصال والصلاحيات');
      if (!getSession()) onExpired();
    } finally { setSending(false); }
  }

  async function action(label: string, endpoint: string, method: 'POST' | 'PATCH', body?: object) {
    setMenuOpen(false);
    try {
      await request(endpoint, method, body);
      await reload();
    } catch (e) {
      Alert.alert('تعذر تنفيذ ' + label, e instanceof Error ? e.message : 'غير مسموح بالإجراء');
      if (!getSession()) onExpired();
    }
  }
  const handle = detail?.handled_by ?? conversation.handled_by;
  const contact = detail?.contact_name || conversation.contact_name || 'عميل';
  return <KeyboardAvoidingView style={s.room} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.roomHeader}>
      <IconButton name="arrow-back" color="white" onPress={onBack} />
      <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 8 }}>
        <Text numberOfLines={1} style={s.roomName}>{contact}</Text>
        <Text style={s.roomSubtitle}>{channelName(detail?.channel_type || conversation.channel_type)} · {handle === 'bot' ? 'البوت يرد' : 'موظف يتابع'}</Text>
      </View>
      <RoundAvatar name={contact} size={40} />
      <IconButton name="ellipsis-vertical" color="white" onPress={() => setMenuOpen(x => !x)} />
    </View>
    {menuOpen && <View style={s.actionMenu}>
      <Pressable style={s.actionMenuItem} onPress={() => void action('الاستلام', '/conversations/' + id + '/takeover', 'POST')}>
        <Text style={s.actionMenuText}>استلام المحادثة</Text>
      </Pressable>
      <Pressable style={s.actionMenuItem} onPress={() => void action('الإرجاع للبوت', '/conversations/' + id + '/release', 'POST')}>
        <Text style={s.actionMenuText}>إرجاع للبوت</Text>
      </Pressable>
      <Pressable style={s.actionMenuItem} onPress={() => void action('التعليق', '/conversations/' + id, 'PATCH', { status: 'pending' })}>
        <Text style={s.actionMenuText}>تعليق المحادثة</Text>
      </Pressable>
      <Pressable style={s.actionMenuItem} onPress={() => void action('الإغلاق', '/conversations/' + id, 'PATCH', { status: 'closed' })}>
        <Text style={s.actionMenuText}>إغلاق المحادثة</Text>
      </Pressable>
      <Pressable style={s.actionMenuItem} onPress={() => void action('تمييز المحادثة', '/conversations/' + id, 'PATCH', { important: !detail?.important })}>
        <Text style={s.actionMenuText}>{detail?.important ? 'إلغاء التمييز' : 'تمييز كمهمة'}</Text>
      </Pressable>
    </View>}
    {notice ? <Banner text={notice} danger /> : null}
    {whatsappExpired && <Banner text="انتهت نافذة رد واتساب (24 ساعة). يلزم قالب معتمد لبدء رسالة جديدة؛ استخدم لوحة الويب حاليًا." />}
    {detail?.status === 'closed' && <Banner text="المحادثة مغلقة. يمكن للموظف فتحها من قائمة الإجراءات إذا كان لديه صلاحية." />}
    <FlatList ref={list} data={messages} keyExtractor={item => item.id} renderItem={({ item }) => <MessageBubble item={item} />}
      contentContainerStyle={s.messageList}
      ListHeaderComponent={hasMore ? <Pressable onPress={() => void older()} style={s.loadOlder}>
        {loadingOlder ? <ActivityIndicator color={C.green} /> : <Text style={{ color: C.green }}>تحميل رسائل أقدم</Text>}
      </Pressable> : null}
      ListEmptyComponent={<Placeholder text="لا توجد رسائل في هذه المحادثة" />}
      onScroll={event => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 90;
      }}
      scrollEventThrottle={160}
      onContentSizeChange={() => { if (!loadingOlder && nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
    />
    <View style={s.composerArea}>
      <Pressable accessibilityLabel="إرسال" accessibilityRole="button" onPress={() => void submit()}
        disabled={sending || !reply.trim() || whatsappExpired}
        style={[s.sendButton, (sending || !reply.trim() || whatsappExpired) && { opacity: .45 }]}>
        {sending ? <ActivityIndicator color="white" /> : <Ionicons name="send" size={19} color="white" />}
      </Pressable>
      <TextInput value={reply} onChangeText={setReply} multiline maxLength={4096} editable={!whatsappExpired}
        textAlign="right" placeholder={whatsappExpired ? 'لا يمكن إرسال رسالة حرة' : 'اكتب رسالة...'}
        placeholderTextColor="#8A9692" accessibilityLabel="نص الرسالة" style={s.composer} />
    </View>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'white' },
  listHeading: { backgroundColor: C.green, paddingHorizontal: 17, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: 'white', fontSize: 25, fontWeight: '800' },
  searchBox: { marginHorizontal: 14, marginTop: 14, marginBottom: 6, paddingHorizontal: 13, backgroundColor: '#F4F7F5', borderRadius: 15, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, height: 46, paddingHorizontal: 9, fontSize: 14, color: C.ink },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  chatItem: { borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 15, gap: 12 },
  chatTitleRow: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-end' },
  chatTitle: { fontSize: 16, fontWeight: '800', color: C.ink, textAlign: 'right', flexShrink: 1 },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 7 },
  preview: { fontSize: 13, color: C.muted, textAlign: 'right', flexShrink: 1 },
  agentLine: { fontSize: 10, color: '#83918B', textAlign: 'right', marginTop: 4 },
  channelDot: { width: 7, height: 7, borderRadius: 4 },
  chatMeta: { justifyContent: 'flex-start', alignItems: 'center', minWidth: 38, gap: 3 },
  unread: { backgroundColor: C.lime, borderRadius: 13, minWidth: 22, paddingHorizontal: 5, height: 21, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  unreadText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  loadOlder: { alignSelf: 'center', padding: 12, marginVertical: 8 },
  room: { flex: 1, backgroundColor: C.wallpaper },
  roomHeader: { minHeight: 66, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3 },
  roomName: { fontSize: 17, fontWeight: '800', color: 'white', textAlign: 'right' },
  roomSubtitle: { fontSize: 11, color: '#DAEDE7', textAlign: 'right', marginTop: 3 },
  actionMenu: { position: 'absolute', top: 60, right: 10, zIndex: 50, width: 190, backgroundColor: 'white', borderRadius: 15, paddingVertical: 6, elevation: 8, shadowColor: 'black', shadowOpacity: .14, shadowRadius: 12 },
  actionMenuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  actionMenuText: { color: C.ink, textAlign: 'right', fontSize: 14 },
  messageList: { padding: 12, paddingBottom: 20, flexGrow: 1 },
  bubbleRow: { width: '100%', marginVertical: 4 },
  bubbleMineRow: { alignItems: 'flex-end' },
  bubbleOtherRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', minWidth: 96, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 13, elevation: 1 },
  bubbleMine: { backgroundColor: C.outgoing, borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: 'white', borderTopLeftRadius: 4 },
  bubbleText: { color: C.ink, fontSize: 15, lineHeight: 22, textAlign: 'auto' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 5 },
  bubbleTime: { fontSize: 10, color: C.muted },
  mediaHint: { flexDirection: 'row', gap: 4, padding: 8, alignItems: 'center' },
  eventWrap: { alignSelf: 'center', marginVertical: 8, backgroundColor: '#DEE9E6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, maxWidth: '85%' },
  eventText: { color: '#556F65', fontSize: 11, textAlign: 'center' },
  composerArea: { backgroundColor: C.wallpaper, flexDirection: 'row', alignItems: 'flex-end', padding: 8, gap: 7, paddingBottom: 12 },
  composer: { flex: 1, backgroundColor: 'white', borderRadius: 22, maxHeight: 135, minHeight: 45, paddingVertical: 10, paddingHorizontal: 14, color: C.ink, fontSize: 15 },
  sendButton: { backgroundColor: C.accent, borderRadius: 25, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
