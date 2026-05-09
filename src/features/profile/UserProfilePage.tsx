import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/commands/transport';
import { useAuthStore } from '@/stores/authStore';
import { ArrowLeft, User, CreditCard, BarChart3, Coins, TrendingUp, Zap, Package, ChevronLeft, ChevronRight, Search, UserCircle, Activity, Calendar, CheckCircle } from 'lucide-react';

interface UserProfilePageProps {
  onClose: () => void;
  viewUserId?: string;
}

type ProfileTab = 'overview' | 'transactions' | 'usage';

interface ProfileUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  credits: number;
  created_at: number;
  updated_at: number;
}

interface ProfileStats {
  txnCount: number;
  usageCount: number;
  successCount: number;
  totalConsumed: number;
  totalRecharged: number;
  totalRefunded: number;
  projectCount: number;
  successRate: number;
}

interface TopModel {
  model: string;
  provider: string;
  count: number;
  total_credits: number;
}

interface ProviderStat {
  provider: string;
  count: number;
  credits: number;
}

interface DayStat {
  day: string;
  count: number;
  credits: number;
}

interface CreditTxn {
  id: string;
  user_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  type: string;
  note: string | null;
  reference: string | null;
  created_at: number;
}

interface UsageLog {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  credits_used: number;
  status: string;
  created_at: number;
}

interface ProfileData {
  user: ProfileUser;
  stats: ProfileStats;
  topModels: TopModel[];
  byProvider: ProviderStat[];
  byDay: DayStat[];
  recentTxns: CreditTxn[];
  recentUsage: UsageLog[];
}

const txnTypeLabels: Record<string, string> = {
  signup_bonus: '注册赠送', recharge: '充值', consume: '消费', refund: '退款', admin_deduct: '管理员扣减',
};

const txnTypeLabelsEn: Record<string, string> = {
  signup_bonus: 'Signup Bonus', recharge: 'Recharge', consume: 'Consume', refund: 'Refund', admin_deduct: 'Admin Deduct',
};

const txnTypeColors: Record<string, string> = {
  signup_bonus: 'text-emerald-400', recharge: 'text-emerald-400', consume: 'text-amber-400', refund: 'text-blue-400', admin_deduct: 'text-red-400',
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtFullDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: typeof User; color: string }) {
  return (
    <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-text-dark">{value}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </div>
  );
}

function MiniBarChart({ data, maxBars = 30 }: { data: DayStat[]; maxBars?: number }) {
  const display = data.slice(0, maxBars).reverse();
  const maxCount = Math.max(1, ...display.map(d => d.count));

  if (display.length === 0) {
    return <div className="text-xs text-text-muted text-center py-6">暂无数据</div>;
  }

  return (
    <div className="flex items-end gap-px h-32">
      {display.map((d) => {
        const pct = Math.max(2, (d.count / maxCount) * 100);
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5 min-w-0" title={`${d.day}: ${d.count}次 / ${d.credits}积分`}>
            <div className="w-full rounded-t-sm overflow-hidden" style={{ height: `${pct}%` }}>
              <div className="w-full h-full bg-accent rounded-t-sm" />
            </div>
            <span className="text-[8px] text-text-muted truncate w-full text-center">{d.day.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function UserProfilePage({ onClose, viewUserId }: UserProfilePageProps) {
  const { t, i18n } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = authUser?.role === 'admin';
  const isZh = i18n.language.startsWith('zh');
  const txnLabels = isZh ? txnTypeLabels : txnTypeLabelsEn;

  const [tab, setTab] = useState<ProfileTab>('overview');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  const [txnPage, setTxnPage] = useState(1);
  const [txns, setTxns] = useState<CreditTxn[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnLoading, setTxnLoading] = useState(false);

  const [usagePage, setUsagePage] = useState(1);
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);

  const [adminUsers, setAdminUsers] = useState<{ id: string; username: string; role: string; credits: number }[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(viewUserId);

  const targetUserId = isAdmin ? (selectedUserId || authUser?.id) : authUser?.id;
  const isViewingSelf = targetUserId === authUser?.id;

  const pageSize = 20;

  const loadProfile = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const data = isViewingSelf
        ? await invoke<ProfileData>('user_profile')
        : await invoke<ProfileData>('admin_user_profile', { userId: targetUserId });
      setProfile(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [targetUserId, isViewingSelf]);

  const loadTxns = useCallback(async () => {
    if (!isViewingSelf) {
      setTxns(profile?.recentTxns || []);
      setTxnTotal(profile?.recentTxns?.length || 0);
      return;
    }
    setTxnLoading(true);
    try {
      const result = await invoke<{ rows: CreditTxn[]; total: number }>('credit_transactions', { page: txnPage, pageSize });
      setTxns(result.rows);
      setTxnTotal(result.total);
    } catch (e) { console.error(e); }
    setTxnLoading(false);
  }, [txnPage, isViewingSelf, profile]);

  const loadUsage = useCallback(async () => {
    if (!isViewingSelf) {
      setUsage(profile?.recentUsage || []);
      setUsageTotal(profile?.recentUsage?.length || 0);
      return;
    }
    setUsageLoading(true);
    try {
      const result = await invoke<{ rows: UsageLog[]; total: number }>('user_usage_log', { page: usagePage, pageSize });
      setUsage(result.rows);
      setUsageTotal(result.total);
    } catch (e) { console.error(e); }
    setUsageLoading(false);
  }, [usagePage, isViewingSelf, profile]);

  const loadAdminUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = await invoke<{ rows: { id: string; username: string; role: string; credits: number }[] }>('admin_users', { page: 1, pageSize: 200, search: adminSearch || undefined });
      setAdminUsers(result.rows);
    } catch (e) { console.error(e); }
  }, [isAdmin, adminSearch]);

  useEffect(() => {
    void loadProfile();
    if (isAdmin && !viewUserId) void loadAdminUsers();
  }, [loadProfile, loadAdminUsers, isAdmin, viewUserId]);

  useEffect(() => {
    if (tab === 'transactions') void loadTxns();
  }, [tab, loadTxns]);

  useEffect(() => {
    if (tab === 'usage') void loadUsage();
  }, [tab, loadUsage]);

  useEffect(() => {
    setTxnPage(1);
    setUsagePage(1);
    setTab('overview');
    void loadProfile();
  }, [selectedUserId]);

  const tabs = [
    { key: 'overview' as ProfileTab, label: t('profile.overview'), icon: Activity },
    { key: 'transactions' as ProfileTab, label: t('profile.transactions'), icon: CreditCard },
    { key: 'usage' as ProfileTab, label: t('profile.usage'), icon: BarChart3 },
  ];

  const txnTotalPages = Math.max(1, Math.ceil(txnTotal / pageSize));
  const usageTotalPages = Math.max(1, Math.ceil(usageTotal / pageSize));

  return (
    <div className="absolute inset-0 flex bg-bg-dark">
      {isAdmin && !viewUserId && (
        <div className="w-[200px] shrink-0 bg-bg-dark border-r border-border-dark flex flex-col">
          <div className="px-3 py-3 border-b border-border-dark">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{t('profile.userList')}</span>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder={t('admin.searchUser')}
                className="h-7 w-full rounded border border-border-dark bg-surface-dark pl-7 pr-2 text-xs text-text-dark outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setSelectedUserId(undefined)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-border-dark/30 transition-colors ${
                !selectedUserId ? 'bg-accent/10 text-text-dark' : 'text-text-muted hover:bg-surface-dark'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCircle className="w-3.5 h-3.5" />
                <span className="font-medium">{t('profile.myProfile')}</span>
              </div>
            </button>
            {adminUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-border-dark/30 transition-colors ${
                  selectedUserId === u.id ? 'bg-accent/10 text-text-dark' : 'text-text-muted hover:bg-surface-dark'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{u.username}</span>
                  <span className="text-[10px] font-mono text-accent">{u.credits}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="shrink-0 px-6 py-3 border-b border-border-dark flex items-center gap-3 bg-surface-dark">
          <button onClick={onClose} className="p-1.5 hover:bg-bg-dark rounded transition-colors" title={t('titleBar.back')}>
            <ArrowLeft className="w-4 h-4 text-text-muted" />
          </button>
          <UserCircle className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-dark">
            {isViewingSelf ? t('profile.myProfile') : `${profile?.user?.username || ''} ${t('profile.profile')}`}
          </h2>
          {!isViewingSelf && profile?.user && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-accent/10 text-accent">{profile.user.role}</span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-0">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2 -mb-3 ${
                  tab === key ? 'border-accent text-text-dark' : 'border-transparent text-text-muted hover:text-text-dark'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-text-muted">{t('common.loading')}</div>
          ) : !profile ? (
            <div className="flex items-center justify-center h-full text-text-muted">{t('common.error')}</div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab profile={profile} isZh={isZh} />}
              {tab === 'transactions' && (
                <TransactionsTab
                  txns={txns}
                  total={txnTotal}
                  page={txnPage}
                  totalPages={txnTotalPages}
                  loading={txnLoading}
                  onPageChange={setTxnPage}
                  txnLabels={txnLabels}
                  canPaginate={isViewingSelf}
                />
              )}
              {tab === 'usage' && (
                <UsageTab
                  usage={usage}
                  total={usageTotal}
                  page={usagePage}
                  totalPages={usageTotalPages}
                  loading={usageLoading}
                  onPageChange={setUsagePage}
                  canPaginate={isViewingSelf}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ profile, isZh }: { profile: ProfileData; isZh: boolean }) {
  const { t } = useTranslation();
  const { user, stats, topModels, byProvider, byDay } = profile;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="rounded-lg border border-border-dark bg-bg-dark p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <User className="w-8 h-8 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-semibold text-text-dark">{user.username}</span>
              <span className={`px-2 py-0.5 rounded text-[11px] ${user.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-bg-dark text-text-muted'}`}>
                {user.role}
              </span>
            </div>
            {user.email && <div className="text-sm text-text-muted mt-0.5">{user.email}</div>}
            <div className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {isZh ? '注册于' : 'Registered'} {fmtFullDate(user.created_at)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-text-muted">{t('admin.credits')}</div>
            <div className="text-4xl font-bold text-accent font-mono">{user.credits}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('profile.totalConsumed')} value={stats.totalConsumed.toLocaleString()} icon={TrendingUp} color="text-amber-400" />
        <StatCard label={t('profile.totalRecharged')} value={stats.totalRecharged.toLocaleString()} icon={Coins} color="text-emerald-400" />
        <StatCard label={t('profile.totalGenerations')} value={stats.usageCount} sub={`${t('admin.successRate')} ${stats.successRate}%`} icon={Zap} color="text-blue-400" />
        <StatCard label={t('profile.projectCount')} value={stats.projectCount} icon={Package} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('profile.successCount')} value={stats.successCount} icon={CheckCircle} color="text-emerald-400" />
        <StatCard label={t('profile.txnCount')} value={stats.txnCount} icon={CreditCard} color="text-blue-400" />
        <StatCard label={t('profile.totalRefunded')} value={stats.totalRefunded.toLocaleString()} icon={Coins} color="text-blue-400" />
        <StatCard label={t('profile.failCount')} value={stats.usageCount - stats.successCount} icon={Zap} color="text-red-400" />
      </div>

      <div className="rounded-lg border border-border-dark bg-bg-dark p-5">
        <h3 className="text-sm font-medium text-text-dark mb-4">{t('profile.dailyUsage')}</h3>
        <MiniBarChart data={byDay} maxBars={30} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topModels.length > 0 && (
          <div className="rounded-lg border border-border-dark bg-bg-dark p-5">
            <h3 className="text-sm font-medium text-text-dark mb-3">{t('profile.topModels')}</h3>
            <div className="space-y-2.5">
              {topModels.map((m, i) => (
                <div key={m.model} className="flex items-center gap-3 text-xs">
                  <span className="w-5 text-right text-text-muted font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-text-dark font-mono truncate block">{m.model}</span>
                    <span className="text-text-muted text-[10px]">{m.provider}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-text-muted">{m.count}{isZh ? '次' : 'x'}</span>
                    <span className="text-accent font-mono font-medium">{m.total_credits}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {byProvider.length > 0 && (
          <div className="rounded-lg border border-border-dark bg-bg-dark p-5">
            <h3 className="text-sm font-medium text-text-dark mb-3">{t('profile.providerBreakdown')}</h3>
            <div className="space-y-3">
              {byProvider.map((p) => {
                const pct = stats.usageCount > 0 ? Math.round(p.count / stats.usageCount * 100) : 0;
                return (
                  <div key={p.provider} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-dark font-medium">{p.provider}</span>
                      <span className="text-text-muted">{p.count}{isZh ? '次' : 'x'} · {p.credits} {isZh ? '积分' : 'credits'} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-border-dark rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionsTab({ txns, total, page, totalPages, loading, onPageChange, txnLabels, canPaginate }: {
  txns: CreditTxn[]; total: number; page: number; totalPages: number; loading: boolean;
  onPageChange: (p: number) => void; txnLabels: Record<string, string>; canPaginate: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted bg-bg-dark sticky top-0">
                <th className="px-5 py-3">{t('admin.time')}</th>
                <th className="px-5 py-3">{t('admin.type')}</th>
                <th className="px-5 py-3 text-right">{t('admin.amount')}</th>
                <th className="px-5 py-3 text-right">{t('admin.balance')}</th>
                <th className="px-5 py-3">{t('admin.note')}</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((txn) => (
                <tr key={txn.id} className="border-t border-border-dark/50 hover:bg-bg-dark/50">
                  <td className="px-5 py-2.5 text-text-muted">{fmtDate(txn.created_at)}</td>
                  <td className={`px-5 py-2.5 ${txnTypeColors[txn.type] || 'text-text-muted'}`}>{txnLabels[txn.type] || txn.type}</td>
                  <td className={`px-5 py-2.5 text-right font-mono ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {txn.amount >= 0 ? '+' : ''}{txn.amount}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-text-muted">{txn.balance_after}</td>
                  <td className="px-5 py-2.5 text-text-muted truncate max-w-[240px]">{txn.note || '-'}</td>
                </tr>
              ))}
              {txns.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-text-muted">{t('profile.noData')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {canPaginate && totalPages > 1 && (
        <div className="shrink-0 px-6 py-3 border-t border-border-dark flex items-center justify-between bg-surface-dark">
          <span className="text-xs text-text-muted">{t('admin.pageInfo', { current: page, total: totalPages, count: total })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageTab({ usage, total, page, totalPages, loading, onPageChange, canPaginate }: {
  usage: UsageLog[]; total: number; page: number; totalPages: number; loading: boolean;
  onPageChange: (p: number) => void; canPaginate: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted bg-bg-dark sticky top-0">
                <th className="px-5 py-3">{t('admin.time')}</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3 text-right">{t('admin.creditsUsed')}</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id} className="border-t border-border-dark/50 hover:bg-bg-dark/50">
                  <td className="px-5 py-2.5 text-text-muted">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-2.5 text-text-muted">{u.provider}</td>
                  <td className="px-5 py-2.5 text-text-muted font-mono">{u.model}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-accent">{u.credits_used}</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${u.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{u.status}</span>
                  </td>
                </tr>
              ))}
              {usage.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-text-muted">{t('profile.noData')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {canPaginate && totalPages > 1 && (
        <div className="shrink-0 px-6 py-3 border-t border-border-dark flex items-center justify-between bg-surface-dark">
          <span className="text-xs text-text-muted">{t('admin.pageInfo', { current: page, total: totalPages, count: total })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
