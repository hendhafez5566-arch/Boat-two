import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  apiConfigured, apiRoot, getSession, request, restoreSession, Session,
  MeResponse, signIn, signOut, switchWorkspace,
} from './src/api';
import type { Conversation } from './src/models';
import { ChatList, ChatRoom } from './src/Chat';
import { OrdersScreen, TasksScreen } from './src/Work';
import { Banner, C, IconButton, PrimaryButton, RoundAvatar } from './src/ui';

type MainTab = 'chats' | 'tasks' | 'orders' | 'account';

function Login({ onSuccess }: { onSuccess: (value: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!email.trim() || !password) { setError('ادخل البريد الإلكتروني وكلمة المرور'); return; }
    setBusy(true);
    setError('');
    try { onSuccess(await signIn(email, password)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل الدخول'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.loginOuter} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.logoCircle}><Ionicons name="chatbubbles" size={45} color="white" /></View>
      <Text style={styles.loginTitle}>Bot Two Team</Text>
      <Text style={styles.loginSubtitle}>شغلك ومحادثات عملائك في مكان واحد</Text>
      <View style={styles.loginForm}>
        <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
        <TextInput style={styles.loginInput} placeholder="name@company.com" keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail}
          accessibilityLabel="البريد الإلكتروني" placeholderTextColor="#A7B0AC" />
        <Text style={styles.inputLabel}>كلمة المرور</Text>
        <TextInput style={styles.loginInput} placeholder="••••••••" secureTextEntry value={password}
          onChangeText={setPassword} accessibilityLabel="كلمة المرور" placeholderTextColor="#A7B0AC"
          onSubmitEditing={() => void submit()} />
        {error ? <Banner text={error} danger /> : null}
        {!apiConfigured() && <Banner text={'يرجى ضبط EXPO_PUBLIC_API_URL بعنوان خادم HTTPS. ' + (apiRoot() || 'غير محدد')} danger />}
        <PrimaryButton title="تسجيل الدخول" loading={busy} disabled={!apiConfigured()} onPress={() => void submit()} />
      </View>
      <Text style={styles.loginFoot}>للمدير والموظفين فقط · نفس حساب المنصة</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function AccountScreen({ session, onChanged, onExpired }: {
  session: Session; onChanged: (s: Session) => void; onExpired: () => void;
}) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { setMe(await request<MeResponse>('/auth/me')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الحساب'); if (!getSession()) onExpired(); }
  }, [onExpired]);
  useEffect(() => { void load(); }, [load]);

  async function availability(available: boolean) {
    setBusy('availability');
    try {
      await request('/team/me/availability', 'PATCH', { available });
      Alert.alert('تم', available ? 'تم تحديث حالتك إلى متاح' : 'تم تحديث حالتك إلى غير متاح');
    } catch (e) { Alert.alert('تعذر تغيير الحالة', String(e)); }
    finally { setBusy(''); }
  }
  async function changeWorkspace(tenantId: string) {
    if (tenantId === session.tenantId) return;
    setBusy('workspace');
    try { onChanged(await switchWorkspace(tenantId)); }
    catch (e) { Alert.alert('تعذر تبديل الشركة', String(e)); }
    finally { setBusy(''); }
  }
  async function logout() {
    setBusy('logout');
    try { await signOut(); } catch { /* The secure local session has already been cleared. */ }
    onExpired();
    setBusy('');
  }
  const roleName = session.role === 'agent' ? 'موظف' : session.role === 'owner' ? 'مالك الشركة' : 'مدير';
  return <ScrollView style={styles.account} contentContainerStyle={{ paddingBottom: 35 }}>
    <View style={styles.accountHeader}><Text style={styles.headerName}>حسابي</Text></View>
    {error ? <Banner text={error} danger /> : null}
    <View style={styles.profileCard}>
      <RoundAvatar name={me?.user?.full_name || me?.user?.email} size={72} />
      <Text style={styles.profileName}>{me?.user?.full_name || 'عضو الفريق'}</Text>
      <Text style={styles.muted}>{me?.user?.email || ''}</Text>
      <Text style={styles.roleText}>{roleName}</Text>
    </View>
    <Text style={styles.sectionTitle}>حالة الموظف</Text>
    <View style={styles.settingCard}>
      <Text style={styles.muted}>حدد هل أنت متاح لاستلام محادثات جديدة</Text>
      <View style={styles.buttonsRow}>
        <Pressable disabled={Boolean(busy)} style={styles.statusButton} onPress={() => void availability(true)}>
          <Ionicons name="checkmark-circle-outline" color={C.green} size={20} /><Text style={styles.statusText}>متاح</Text>
        </Pressable>
        <Pressable disabled={Boolean(busy)} style={styles.statusButton} onPress={() => void availability(false)}>
          <Ionicons name="moon-outline" color={C.muted} size={20} /><Text style={styles.statusText}>غير متاح</Text>
        </Pressable>
      </View>
    </View>
    <Text style={styles.sectionTitle}>الشركة</Text>
    <View style={styles.settingCard}>
      {(me?.workspaces || session.workspaces || []).map(item =>
        <Pressable key={item.tenant_id} disabled={Boolean(busy)}
          style={styles.workspaceRow} onPress={() => void changeWorkspace(item.tenant_id)}>
          <Ionicons name={item.tenant_id === session.tenantId ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={C.green} />
          <Text style={styles.workspaceName}>{item.name || item.workspace_name || 'شركة ' + item.tenant_id.slice(0, 8)}</Text>
        </Pressable>
      )}
      {(!me?.workspaces?.length && !session.workspaces?.length) && <Text style={styles.muted}>الشركة الحالية: {session.tenantId.slice(0, 8)}</Text>}
    </View>
    <Text style={styles.sectionTitle}>الأمان</Text>
    <View style={styles.settingCard}>
      <Text style={styles.muted}>الجلسة محفوظة في مساحة التخزين الآمن على الهاتف. يُفضل تفعيل قفل الجهاز.</Text>
      <Pressable style={styles.signOut} disabled={Boolean(busy)} onPress={() => void logout()}>
        <Ionicons name="log-out-outline" size={20} color={C.red} /><Text style={{ color: C.red, fontWeight: '800' }}>تسجيل الخروج</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

function Workspace({ session, onSession, onExpired }: {
  session: Session; onSession: (next: Session) => void; onExpired: () => void;
}) {
  const [tab, setTab] = useState<MainTab>('chats');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const isManager = session.role === 'owner' || session.role === 'admin';
  const tabs: { id: MainTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { id: 'chats', label: 'الشات', icon: 'chatbubbles-outline' },
    { id: 'tasks', label: 'مهامي', icon: 'checkmark-done-outline' },
    ...(isManager ? [{ id: 'orders' as MainTab, label: 'الطلبات', icon: 'receipt-outline' as const }] : []),
    { id: 'account', label: 'حسابي', icon: 'person-circle-outline' },
  ];
  if (conversation) {
    return <ChatRoom conversation={conversation} onBack={() => setConversation(null)} onExpired={onExpired} />;
  }
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }}>
      {tab === 'chats' ? <ChatList onOpen={setConversation} onExpired={onExpired} initialFilter={isManager ? 'all' : 'mine'} /> : null}
      {tab === 'tasks' ? <TasksScreen onExpired={onExpired} /> : null}
      {tab === 'orders' && isManager ? <OrdersScreen onExpired={onExpired} /> : null}
      {tab === 'account' ? <AccountScreen session={session} onChanged={onSession} onExpired={onExpired} /> : null}
    </View>
    <View style={styles.tabbar}>
      {tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }}
        style={[styles.tab, tab === item.id && styles.activeTab]} onPress={() => setTab(item.id)}>
        <Ionicons name={item.icon} size={23} color={tab === item.id ? C.green : C.muted} />
        <Text style={[styles.tabLabel, tab === item.id && styles.activeTabText]}>{item.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const expired = useCallback(() => setSession(null), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await restoreSession();
        if (value) await request('/auth/me');
        if (!cancelled) setSession(getSession());
      } catch { if (!cancelled) setSession(null); }
      finally { if (!cancelled) setBooting(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return <SafeAreaProvider>
    <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
      <StatusBar backgroundColor={C.greenDark} barStyle="light-content" />
      {booting ? <View style={styles.loading}><ActivityIndicator size="large" color={C.green} /></View> :
        session ? <Workspace key={session.tenantId} session={session} onSession={setSession} onExpired={expired} /> :
          <Login onSuccess={setSession} />}
    </SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: 'white' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginOuter: { flex: 1, backgroundColor: C.background },
  loginContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 36 },
  logoCircle: { width: 94, height: 94, borderRadius: 30, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  loginTitle: { fontSize: 30, color: C.ink, fontWeight: '900' },
  loginSubtitle: { fontSize: 15, color: C.muted, marginTop: 8, textAlign: 'center' },
  loginForm: { width: '100%', backgroundColor: 'white', borderRadius: 22, padding: 22, marginTop: 32, gap: 13, borderWidth: 1, borderColor: C.line },
  inputLabel: { color: C.ink, fontSize: 14, textAlign: 'right', fontWeight: '700' },
  loginInput: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, color: C.ink, textAlign: 'left', fontSize: 15 },
  loginFoot: { color: C.muted, marginTop: 26, fontSize: 12 },
  tabbar: { backgroundColor: 'white', borderTopWidth: 1, borderColor: C.line, flexDirection: 'row', minHeight: 64, justifyContent: 'space-around', paddingBottom: 2 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderTopWidth: 3, borderTopColor: 'transparent' },
  activeTab: { borderTopColor: C.accent, backgroundColor: '#F3FAF6' },
  tabLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  activeTabText: { color: C.green, fontWeight: '800' },
  account: { flex: 1, backgroundColor: C.background },
  accountHeader: { backgroundColor: C.green, padding: 18 },
  headerName: { fontSize: 24, color: 'white', fontWeight: '800', textAlign: 'right' },
  profileCard: { backgroundColor: 'white', alignItems: 'center', margin: 15, borderRadius: 20, padding: 24, gap: 7, borderWidth: 1, borderColor: C.line },
  profileName: { fontSize: 21, color: C.ink, fontWeight: '900' },
  muted: { color: C.muted, fontSize: 13, lineHeight: 21, textAlign: 'right' },
  roleText: { backgroundColor: '#E0F4E9', color: C.green, paddingHorizontal: 15, paddingVertical: 7, borderRadius: 15, fontWeight: '800', overflow: 'hidden' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.ink, textAlign: 'right', paddingHorizontal: 20, marginTop: 17, marginBottom: 8 },
  settingCard: { backgroundColor: 'white', marginHorizontal: 15, padding: 16, borderRadius: 15, borderWidth: 1, borderColor: C.line, gap: 15 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 10 },
  statusButton: { borderWidth: 1, borderColor: C.line, padding: 13, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, flex: 1 },
  statusText: { color: C.ink, fontWeight: '700' },
  workspaceRow: { flexDirection: 'row', gap: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.line },
  workspaceName: { color: C.ink, fontWeight: '700', textAlign: 'right' },
  signOut: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 11, borderRadius: 12, backgroundColor: '#FFF1EF' },
});
