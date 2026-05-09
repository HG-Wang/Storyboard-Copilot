import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/commands/transport';
import { X, Users, CreditCard, Settings, BarChart3, Plus, Trash2, Power, LayoutDashboard, Search, Eye, Edit3, ChevronLeft, ChevronRight, TrendingUp, UserCheck, Zap, Coins, Package, Filter, UserCircle } from 'lucide-react';

interface AdminPageProps { isOpen: boolean; onClose: () => void; onViewUserProfile?: (userId: string) => void; }

type AdminTab = 'dashboard' | 'users' | 'providers' | 'pricing' | 'usage' | 'system';

interface AdminUser {
  id: string; username: string; email: string | null; role: string;
  credits: number; created_at: number; updated_at: number;
}

interface UserDetail extends AdminUser {
  txnCount: number; usageCount: number; totalConsumed: number;
  recentTxns: CreditTxn[]; recentUsage: UsageLog[];
}

interface ProviderConfig {
  provider_id: string; display_name: string; api_key: string;
  base_url: string | null; enabled: number;
  models?: ModelPricing[];
}

interface ModelPricing {
  model_id: string; provider_id: string; display_name: string; credits_per_image: number;
}

interface UsageLog {
  id: string; user_id: string; provider: string; model: string;
  credits_used: number; status: string; created_at: number;
}

interface CreditTxn {
  id: string; user_id: string; amount: number; balance_before: number;
  balance_after: number; type: string; note: string | null; reference: string | null; created_at: number;
}

interface DashboardStats {
  totalUsers: number; totalAdmins: number; totalCreditsIssued: number; totalCreditsConsumed: number;
  totalGenerations: number; successGenerations: number;
  todayUsers: number; todayGenerations: number; todayConsumed: number;
  topModels: { model: string; count: number; total_credits: number }[];
  recentUsers: { id: string; username: string; role: string; credits: number; created_at: number }[];
}

interface UsageStats {
  byProvider: { provider: string; count: number; credits: number }[];
  byDay: { day: string; count: number; credits: number }[];
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: typeof Users; color: string }) {
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

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

const txnTypeLabels: Record<string, string> = {
  signup_bonus: '注册赠送', recharge: '充值', consume: '消费', refund: '退款', admin_deduct: '管理员扣减',
};

const txnTypeColors: Record<string, string> = {
  signup_bonus: 'text-emerald-400', recharge: 'text-emerald-400', consume: 'text-amber-400', refund: 'text-blue-400', admin_deduct: 'text-red-400',
};

export function AdminPage({ isOpen, onClose, onViewUserProfile }: AdminPageProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>('dashboard');

  const tabs = [
    { key: 'dashboard' as AdminTab, label: t('admin.dashboard'), icon: LayoutDashboard },
    { key: 'users' as AdminTab, label: t('admin.users'), icon: Users },
    { key: 'providers' as AdminTab, label: t('admin.providers'), icon: Settings },
    { key: 'pricing' as AdminTab, label: t('admin.pricing'), icon: CreditCard },
    { key: 'usage' as AdminTab, label: t('admin.usage'), icon: BarChart3 },
    { key: 'system' as AdminTab, label: t('admin.system'), icon: Package },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-[min(96vw,1080px)] h-[min(94vh,680px)] rounded-xl border border-border-dark bg-surface-dark shadow-2xl flex overflow-hidden">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-bg-dark rounded z-10"><X className="w-5 h-5 text-text-muted" /></button>

        <div className="w-[170px] shrink-0 bg-bg-dark border-r border-border-dark flex flex-col">
          <div className="px-4 py-4">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{t('admin.title')}</span>
          </div>
          <nav className="flex-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${tab === key ? 'bg-accent/10 text-text-dark border-l-2 border-accent' : 'text-text-muted hover:text-text-dark'}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'users' && <UsersTab onViewUserProfile={onViewUserProfile} />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'pricing' && <PricingTab />}
          {tab === 'usage' && <UsageTab />}
          {tab === 'system' && <SystemTab />}
        </div>
      </div>
    </div>
  );
}

/* ==================== DASHBOARD ==================== */

function DashboardTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    invoke<DashboardStats>('admin_stats').then(setStats).catch(console.error);
    invoke<UsageStats>('admin_usage_stats').then(setUsageStats).catch(console.error);
  }, []);

  if (!stats) return <div className="flex-1 flex items-center justify-center text-text-muted">{t('common.loading')}</div>;

  const successRate = stats.totalGenerations > 0 ? Math.round(stats.successGenerations / stats.totalGenerations * 100) : 0;

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark"><h2 className="text-lg font-semibold text-text-dark">{t('admin.dashboard')}</h2></div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('admin.totalUsers')} value={stats.totalUsers} icon={Users} color="text-blue-400" />
          <StatCard label={t('admin.totalGenerations')} value={stats.totalGenerations} sub={`${t('admin.successRate')} ${successRate}%`} icon={Zap} color="text-amber-400" />
          <StatCard label={t('admin.totalCreditsIssued')} value={stats.totalCreditsIssued.toLocaleString()} icon={Coins} color="text-emerald-400" />
          <StatCard label={t('admin.totalCreditsConsumed')} value={stats.totalCreditsConsumed.toLocaleString()} icon={TrendingUp} color="text-red-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
            <h3 className="text-sm font-medium text-text-dark mb-3">{t('admin.todayStats')}</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xl font-bold text-text-dark">{stats.todayUsers}</div><div className="text-xs text-text-muted">{t('admin.activeUsers')}</div></div>
              <div><div className="text-xl font-bold text-text-dark">{stats.todayGenerations}</div><div className="text-xs text-text-muted">{t('admin.todayGenerations')}</div></div>
              <div><div className="text-xl font-bold text-accent">{stats.todayConsumed}</div><div className="text-xs text-text-muted">{t('admin.todayConsumed')}</div></div>
            </div>
          </div>

          <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
            <h3 className="text-sm font-medium text-text-dark mb-3">{t('admin.topModels')}</h3>
            <div className="space-y-2">
              {stats.topModels.slice(0, 5).map((m) => (
                <div key={m.model} className="flex items-center justify-between text-xs">
                  <span className="text-text-dark font-mono truncate mr-2">{m.model}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-text-muted">{m.count}次</span>
                    <span className="text-accent">{m.total_credits}积分</span>
                  </div>
                </div>
              ))}
              {stats.topModels.length === 0 && <div className="text-xs text-text-muted">暂无数据</div>}
            </div>
          </div>
        </div>

        {usageStats && usageStats.byProvider.length > 0 && (
          <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
            <h3 className="text-sm font-medium text-text-dark mb-3">{t('admin.byProvider')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {usageStats.byProvider.map((p) => (
                <div key={p.provider} className="rounded border border-border-dark bg-surface-dark p-3">
                  <div className="text-sm font-medium text-text-dark">{p.provider}</div>
                  <div className="text-xs text-text-muted mt-1">{p.count}次 / {p.credits}积分</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
          <h3 className="text-sm font-medium text-text-dark mb-3">{t('admin.recentUsers')}</h3>
          <div className="space-y-2">
            {stats.recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-text-dark">{u.username}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${u.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-bg-dark text-text-muted'}`}>{u.role}</span>
                </div>
                <span className="text-text-muted">{fmtDate(u.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ==================== USERS TAB ==================== */

function UsersTab({ onViewUserProfile }: { onViewUserProfile?: (userId: string) => void }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [rechargeTarget, setRechargeTarget] = useState<{ userId: string; username: string } | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeNote, setRechargeNote] = useState('');
  const [actionType, setActionType] = useState<'recharge' | 'deduct'>('recharge');

  const pageSize = 15;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ rows: AdminUser[]; total: number }>('admin_users', { page, pageSize, search: search || undefined });
      setUsers(result.rows);
      setTotal(result.total);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const loadUserDetail = async (userId: string) => {
    try {
      const detail = await invoke<UserDetail>('admin_user_detail', { userId });
      setSelectedUser(detail);
    } catch (e) { console.error(e); }
  };

  const handleRecharge = async () => {
    if (!rechargeTarget || !rechargeAmount) return;
    const amount = parseInt(rechargeAmount, 10);
    if (amount <= 0) return;
    try {
      const endpoint = actionType === 'recharge' ? 'admin_recharge_credits' : 'admin_deduct_credits';
      await invoke(endpoint, { userId: rechargeTarget.userId, amount, note: rechargeNote || undefined });
      setRechargeTarget(null);
      setRechargeAmount('');
      setRechargeNote('');
      void loadUsers();
      if (selectedUser?.id === rechargeTarget.userId) void loadUserDetail(rechargeTarget.userId);
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleSetRole = async (userId: string, role: string) => {
    try { await invoke('admin_set_role', { userId, role }); void loadUsers(); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`确认删除用户「${username}」？此操作不可恢复。`)) return;
    try { await invoke('admin_delete_user', { userId }); void loadUsers(); setSelectedUser(null); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (selectedUser) {
    return (
      <>
        <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
          <button onClick={() => setSelectedUser(null)} className="p-1 hover:bg-bg-dark rounded"><ChevronLeft className="w-4 h-4 text-text-muted" /></button>
          <h2 className="text-lg font-semibold text-text-dark">{t('admin.userDetail')}: {selectedUser.username}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border-dark bg-bg-dark p-3">
              <div className="text-xs text-text-muted">{t('admin.credits')}</div>
              <div className="text-xl font-bold text-accent">{selectedUser.credits}</div>
            </div>
            <div className="rounded-lg border border-border-dark bg-bg-dark p-3">
              <div className="text-xs text-text-muted">{t('admin.totalConsumed')}</div>
              <div className="text-xl font-bold text-amber-400">{selectedUser.totalConsumed}</div>
            </div>
            <div className="rounded-lg border border-border-dark bg-bg-dark p-3">
              <div className="text-xs text-text-muted">{t('admin.txnCount')}</div>
              <div className="text-xl font-bold text-text-dark">{selectedUser.txnCount}</div>
            </div>
            <div className="rounded-lg border border-border-dark bg-bg-dark p-3">
              <div className="text-xs text-text-muted">{t('admin.generationCount')}</div>
              <div className="text-xl font-bold text-text-dark">{selectedUser.usageCount}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => onViewUserProfile?.(selectedUser.id)}
              className="h-8 px-3 rounded bg-accent/10 text-accent text-xs hover:bg-accent/20 flex items-center gap-1.5">
              <UserCircle className="w-3.5 h-3.5" />{t('profile.title')}
            </button>
            <button onClick={() => { setRechargeTarget({ userId: selectedUser.id, username: selectedUser.username }); setActionType('recharge'); setRechargeAmount(''); setRechargeNote(''); }}
              className="h-8 px-3 rounded bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20">{t('admin.recharge')}</button>
            <button onClick={() => { setRechargeTarget({ userId: selectedUser.id, username: selectedUser.username }); setActionType('deduct'); setRechargeAmount(''); setRechargeNote(''); }}
              className="h-8 px-3 rounded bg-amber-500/10 text-amber-400 text-xs hover:bg-amber-500/20">{t('admin.deduct')}</button>
            <button onClick={() => void handleDeleteUser(selectedUser.id, selectedUser.username)}
              className="h-8 px-3 rounded bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20">{t('common.delete')}</button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-dark mb-2">{t('admin.recentTxns')}</h3>
            <div className="rounded-lg border border-border-dark overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-bg-dark text-text-muted">
                  <th className="px-3 py-2 text-left">{t('admin.time')}</th>
                  <th className="px-3 py-2 text-left">{t('admin.type')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.amount')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.balance')}</th>
                  <th className="px-3 py-2 text-left">{t('admin.note')}</th>
                </tr></thead>
                <tbody>
                  {selectedUser.recentTxns.map((txn) => (
                    <tr key={txn.id} className="border-t border-border-dark/50">
                      <td className="px-3 py-1.5 text-text-muted">{fmtDate(txn.created_at)}</td>
                      <td className={`px-3 py-1.5 ${txnTypeColors[txn.type] || 'text-text-muted'}`}>{txnTypeLabels[txn.type] || txn.type}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{txn.amount >= 0 ? '+' : ''}{txn.amount}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-text-muted">{txn.balance_after}</td>
                      <td className="px-3 py-1.5 text-text-muted truncate max-w-[200px]">{txn.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedUser.recentUsage.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-dark mb-2">{t('admin.recentUsage')}</h3>
              <div className="rounded-lg border border-border-dark overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-bg-dark text-text-muted">
                    <th className="px-3 py-2 text-left">{t('admin.time')}</th>
                    <th className="px-3 py-2 text-left">Provider</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-right">{t('admin.creditsUsed')}</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr></thead>
                  <tbody>
                    {selectedUser.recentUsage.map((u) => (
                      <tr key={u.id} className="border-t border-border-dark/50">
                        <td className="px-3 py-1.5 text-text-muted">{fmtDate(u.created_at)}</td>
                        <td className="px-3 py-1.5 text-text-muted">{u.provider}</td>
                        <td className="px-3 py-1.5 text-text-muted font-mono">{u.model}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-accent">{u.credits_used}</td>
                        <td className={`px-3 py-1.5 ${u.status === 'succeeded' ? 'text-emerald-400' : 'text-red-400'}`}>{u.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {rechargeTarget && (
          <div className="px-6 py-3 border-t border-border-dark flex items-center gap-3">
            <span className="text-xs text-text-muted">
              {actionType === 'recharge' ? t('admin.rechargeFor') : t('admin.deductFor')} <strong className="text-text-dark">{rechargeTarget.username}</strong>:
            </span>
            <input type="number" min="1" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder={t('admin.amount')}
              className="h-8 w-24 rounded border border-border-dark bg-bg-dark px-2 text-sm text-text-dark" />
            <input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} placeholder={t('admin.noteOptional')}
              className="h-8 w-40 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark" />
            <button onClick={() => void handleRecharge()}
              className={`h-8 px-3 rounded text-white text-xs ${actionType === 'recharge' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}>{t('admin.confirm')}</button>
            <button onClick={() => setRechargeTarget(null)} className="h-8 px-3 rounded border border-border-dark text-xs text-text-muted hover:bg-bg-dark">{t('common.cancel')}</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-dark">{t('admin.userManagement')} <span className="text-sm font-normal text-text-muted">({total})</span></h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('admin.searchUser')}
              className="h-8 w-48 rounded-lg border border-border-dark bg-bg-dark pl-8 pr-3 text-xs text-text-dark outline-none focus:border-accent" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-text-muted bg-bg-dark sticky top-0">
              <th className="px-4 py-2.5">{t('admin.username')}</th>
              <th className="px-4 py-2.5">{t('admin.email')}</th>
              <th className="px-4 py-2.5">{t('admin.role')}</th>
              <th className="px-4 py-2.5 text-right">{t('admin.credits')}</th>
              <th className="px-4 py-2.5">{t('admin.registered')}</th>
              <th className="px-4 py-2.5">{t('admin.actions')}</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border-dark/50 hover:bg-bg-dark/50 transition-colors">
                  <td className="px-4 py-2 text-text-dark font-medium">{u.username}</td>
                  <td className="px-4 py-2 text-text-muted text-xs">{u.email || '-'}</td>
                  <td className="px-4 py-2">
                    <select value={u.role} onChange={(e) => void handleSetRole(u.id, e.target.value)}
                      className="h-6 rounded border border-border-dark bg-bg-dark px-1.5 text-xs text-text-dark">
                      <option value="user">user</option><option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-accent">{u.credits}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{fmtShortDate(u.created_at)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => void loadUserDetail(u.id)} title={t('admin.viewDetail')}
                        className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:bg-bg-dark hover:text-text-dark"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => onViewUserProfile?.(u.id)} title={t('profile.title')}
                        className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:bg-bg-dark hover:text-accent"><UserCircle className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setRechargeTarget({ userId: u.id, username: u.username }); setActionType('recharge'); setRechargeAmount(''); setRechargeNote(''); }}
                        className="h-7 px-2 rounded text-xs bg-accent/10 text-accent hover:bg-accent/20">{t('admin.recharge')}</button>
                      <button onClick={() => void handleDeleteUser(u.id, u.username)}
                        className="h-7 w-7 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="px-6 py-2.5 border-t border-border-dark flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('admin.pageInfo', { current: page, total: totalPages, count: total })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
      {rechargeTarget && (
        <div className="px-6 py-3 border-t border-border-dark flex items-center gap-3">
          <span className="text-xs text-text-muted">
            {actionType === 'recharge' ? t('admin.rechargeFor') : t('admin.deductFor')} <strong className="text-text-dark">{rechargeTarget.username}</strong>:
          </span>
          <input type="number" min="1" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder={t('admin.amount')}
            className="h-8 w-24 rounded border border-border-dark bg-bg-dark px-2 text-sm text-text-dark" />
          <input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} placeholder={t('admin.noteOptional')}
            className="h-8 w-40 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark" />
          <button onClick={() => void handleRecharge()}
            className={`h-8 px-3 rounded text-white text-xs ${actionType === 'recharge' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}>{t('admin.confirm')}</button>
          <button onClick={() => setRechargeTarget(null)} className="h-8 px-3 rounded border border-border-dark text-xs text-text-muted hover:bg-bg-dark">{t('common.cancel')}</button>
        </div>
      )}
    </>
  );
}

/* ==================== PROVIDERS TAB ==================== */

function ProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<Partial<ProviderConfig> | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [addModelTarget, setAddModelTarget] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ model_id: '', display_name: '', credits_per_image: '1' });

  const isEditingExisting = editing?.provider_id ? providers.some(p => p.provider_id === editing.provider_id) : false;

  const load = useCallback(async () => {
    try { setProviders(await invoke<ProviderConfig[]>('admin_list_providers')); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.provider_id || !editing?.api_key) return;
    try {
      await invoke('admin_save_provider', editing);
      setEditing(null);
      void load();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleToggle = async (providerId: string, currentEnabled: number) => {
    try { await invoke('admin_toggle_provider', { provider_id: providerId, enabled: !currentEnabled }); void load(); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm(`确认删除供应商「${providerId}」及其所有模型？`)) return;
    try { await invoke('admin_delete_provider', { provider_id: providerId }); void load(); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleEdit = (p: ProviderConfig) => {
    setEditing({ provider_id: p.provider_id, display_name: p.display_name, api_key: p.api_key, base_url: p.base_url, enabled: p.enabled });
  };

  const handleAddModel = async (providerId: string) => {
    if (!newModel.model_id) return;
    try {
      await invoke('admin_save_pricing', {
        model_id: newModel.model_id,
        provider_id: providerId,
        display_name: newModel.display_name || newModel.model_id,
        credits_per_image: parseInt(newModel.credits_per_image, 10) || 1,
      });
      setAddModelTarget(null);
      setNewModel({ model_id: '', display_name: '', credits_per_image: '1' });
      void load();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm(`确认删除模型「${modelId}」？`)) return;
    try { await invoke('admin_delete_pricing', { model_id: modelId }); void load(); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleUpdateModelCredits = async (model: ModelPricing, newCredits: number) => {
    if (newCredits < 1) return;
    try {
      await invoke('admin_save_pricing', { ...model, credits_per_image: newCredits });
      void load();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark">
        <h2 className="text-lg font-semibold text-text-dark">{t('admin.providerConfig')}</h2>
        <p className="text-xs text-text-muted mt-1">{t('admin.providerConfigDesc')}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {providers.map((p) => (
          <div key={p.provider_id} className={`rounded-lg border ${p.enabled ? 'border-border-dark' : 'border-border-dark/50 opacity-60'} bg-bg-dark overflow-hidden`}>
            {/* Provider header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-dark">{p.display_name}</span>
                    <span className="text-xs text-text-muted font-mono">({p.provider_id})</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {p.enabled ? t('admin.enabled') : t('admin.disabled')}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-text-muted">
                      API Key: {showApiKey[p.provider_id] ? p.api_key : `${p.api_key.slice(0, 8)}${'*'.repeat(Math.max(0, p.api_key.length - 12))}${p.api_key.slice(-4)}`}
                      <button onClick={() => setShowApiKey(prev => ({ ...prev, [p.provider_id]: !prev[p.provider_id] }))}
                        className="ml-2 text-accent hover:underline">{showApiKey[p.provider_id] ? t('admin.hide') : t('admin.show')}</button>
                    </div>
                    {p.base_url && <div className="text-xs text-text-muted/70">Endpoint: <span className="font-mono">{p.base_url}</span></div>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button onClick={() => void handleToggle(p.provider_id, p.enabled)} title={p.enabled ? t('admin.disable') : t('admin.enable')}
                    className={`h-8 w-8 flex items-center justify-center rounded ${p.enabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-text-muted hover:bg-bg-dark'}`}>
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(p)} title={t('common.edit')}
                    className="h-8 w-8 flex items-center justify-center rounded text-text-muted hover:bg-bg-dark hover:text-text-dark">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => void handleDelete(p.provider_id)} title={t('common.delete')}
                    className="h-8 w-8 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Models section */}
            <div className="border-t border-border-dark/50 bg-surface-dark/50">
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">{t('admin.models')} ({(p.models || []).length})</span>
                <button onClick={() => { setAddModelTarget(addModelTarget === p.provider_id ? null : p.provider_id); setNewModel({ model_id: '', display_name: '', credits_per_image: '1' }); }}
                  className="h-6 px-2 rounded text-[11px] text-accent hover:bg-accent/10 flex items-center gap-1">
                  <Plus className="w-3 h-3" />{t('admin.addModel')}
                </button>
              </div>

              {(p.models || []).length > 0 && (
                <div className="px-4 pb-2 space-y-1">
                  {(p.models || []).map((m) => (
                    <div key={m.model_id} className="flex items-center gap-2 h-8 px-2 rounded bg-bg-dark/50 group">
                      <span className="text-xs text-text-dark font-mono flex-1 truncate">{m.model_id}</span>
                      <span className="text-[11px] text-text-muted truncate max-w-[120px]">{m.display_name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" min="1" defaultValue={m.credits_per_image}
                          onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v !== m.credits_per_image && v >= 1) void handleUpdateModelCredits(m, v); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="h-6 w-14 rounded border border-border-dark bg-bg-dark px-1.5 text-[11px] text-accent text-center font-mono outline-none focus:border-accent" />
                        <span className="text-[10px] text-text-muted">{t('admin.creditsPerImage')}</span>
                        <button onClick={() => void handleDeleteModel(m.model_id)}
                          className="h-6 w-6 flex items-center justify-center rounded text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-opacity">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {addModelTarget === p.provider_id && (
                <div className="px-4 pb-3 pt-1">
                  <div className="flex items-center gap-2">
                    <input value={newModel.model_id} onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value })}
                      placeholder="model-id" className="h-7 flex-1 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark font-mono outline-none focus:border-accent" />
                    <input value={newModel.display_name} onChange={(e) => setNewModel({ ...newModel, display_name: e.target.value })}
                      placeholder={t('admin.displayName')} className="h-7 w-28 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark outline-none focus:border-accent" />
                    <input type="number" min="1" value={newModel.credits_per_image} onChange={(e) => setNewModel({ ...newModel, credits_per_image: e.target.value })}
                      className="h-7 w-16 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark text-center outline-none focus:border-accent" />
                    <button onClick={() => void handleAddModel(p.provider_id)}
                      className="h-7 px-3 rounded bg-accent text-white text-xs hover:bg-accent/80">{t('common.save')}</button>
                    <button onClick={() => setAddModelTarget(null)}
                      className="h-7 px-2 rounded text-xs text-text-muted hover:bg-bg-dark">✕</button>
                  </div>
                </div>
              )}

              {(p.models || []).length === 0 && addModelTarget !== p.provider_id && (
                <div className="px-4 pb-3 text-[11px] text-text-muted/60">{t('admin.noModelsHint')}</div>
              )}
            </div>
          </div>
        ))}

        {providers.length === 0 && !editing && (
          <div className="text-center py-12 text-text-muted text-sm">{t('admin.noProviders')}</div>
        )}

        {editing ? (
          <div className="rounded-lg border border-accent/30 bg-bg-dark p-4 space-y-3">
            <div className="text-sm font-medium text-text-dark">{isEditingExisting ? t('admin.editProvider') : t('admin.addProvider')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Provider ID</label>
                <input value={editing.provider_id || ''} onChange={(e) => setEditing(prev => ({ ...prev!, provider_id: e.target.value }))}
                  disabled={isEditingExisting}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark disabled:opacity-50" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t('admin.displayName')}</label>
                <input value={editing.display_name || ''} onChange={(e) => setEditing(prev => ({ ...prev!, display_name: e.target.value }))}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-muted mb-1 block">API Key</label>
                <input value={editing.api_key || ''} onChange={(e) => setEditing(prev => ({ ...prev!, api_key: e.target.value }))}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark font-mono" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-muted mb-1 block">{t('admin.baseUrlOptional')}</label>
                <input value={editing.base_url || ''} onChange={(e) => setEditing(prev => ({ ...prev!, base_url: e.target.value }))}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark font-mono" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleSave()} className="h-8 px-4 rounded bg-accent text-white text-xs hover:bg-accent/80">{t('common.save')}</button>
              <button onClick={() => setEditing(null)} className="h-8 px-4 rounded border border-border-dark text-xs text-text-muted hover:bg-bg-dark">{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing({ provider_id: '', display_name: '', api_key: '', base_url: '' })}
            className="w-full rounded-lg border border-dashed border-border-dark p-4 text-sm text-text-muted hover:text-text-dark hover:border-accent/50 transition-colors flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />{t('admin.addProvider')}
          </button>
        )}
      </div>
    </>
  );
}

/* ==================== PRICING TAB ==================== */

function PricingTab() {
  const { t } = useTranslation();
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [editing, setEditing] = useState<Partial<ModelPricing> | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ modelId: string; value: string } | null>(null);

  const load = useCallback(async () => {
    try { setPricing(await invoke<ModelPricing[]>('admin_list_pricing')); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.model_id || !editing?.provider_id) return;
    try {
      await invoke('admin_save_pricing', { ...editing, credits_per_image: editing.credits_per_image || 1 });
      setEditing(null);
      void load();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleInlineSave = async (modelId: string) => {
    if (!inlineEdit || inlineEdit.modelId !== modelId) return;
    const credits = parseInt(inlineEdit.value, 10);
    if (isNaN(credits) || credits < 1) return;
    const existing = pricing.find(p => p.model_id === modelId);
    if (!existing) return;
    try {
      await invoke('admin_save_pricing', { ...existing, credits_per_image: credits });
      setInlineEdit(null);
      void load();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm(`确认删除模型「${modelId}」的定价？`)) return;
    try { await invoke('admin_delete_pricing', { model_id: modelId }); void load(); } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const grouped = pricing.reduce<Record<string, ModelPricing[]>>((acc, p) => {
    (acc[p.provider_id] ??= []).push(p);
    return acc;
  }, {});

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark">
        <h2 className="text-lg font-semibold text-text-dark">{t('admin.modelPricing')}</h2>
        <p className="text-xs text-text-muted mt-1">{t('admin.modelPricingDesc')}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(grouped).map(([providerId, models]) => (
          <div key={providerId} className="rounded-lg border border-border-dark bg-bg-dark overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-dark border-b border-border-dark flex items-center gap-2">
              <span className="text-sm font-medium text-text-dark">{providerId}</span>
              <span className="text-xs text-text-muted">({models.length} {t('admin.models')})</span>
            </div>
            <div className="divide-y divide-border-dark/50">
              {models.map((p) => (
                <div key={p.model_id} className="px-4 py-2.5 flex items-center justify-between hover:bg-surface-dark/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-dark">{p.display_name}</div>
                    <div className="text-xs text-text-muted font-mono">{p.model_id}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {inlineEdit?.modelId === p.model_id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" min="1" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          className="h-7 w-16 rounded border border-accent bg-bg-dark px-2 text-xs text-text-dark text-center font-mono"
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleInlineSave(p.model_id); if (e.key === 'Escape') setInlineEdit(null); }}
                          autoFocus />
                        <button onClick={() => void handleInlineSave(p.model_id)} className="h-7 px-2 rounded bg-accent text-white text-xs">OK</button>
                        <button onClick={() => setInlineEdit(null)} className="h-7 px-2 rounded text-xs text-text-muted hover:bg-bg-dark">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setInlineEdit({ modelId: p.model_id, value: String(p.credits_per_image) })}
                        className="text-sm font-mono text-accent hover:underline cursor-pointer px-2 py-0.5 rounded hover:bg-accent/5">
                        {p.credits_per_image} <span className="text-xs text-text-muted">{t('admin.creditsPerImage')}</span>
                      </button>
                    )}
                    <button onClick={() => void handleDelete(p.model_id)}
                      className="h-7 w-7 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {editing ? (
          <div className="rounded-lg border border-accent/30 bg-bg-dark p-4 space-y-3">
            <div className="text-sm font-medium text-text-dark">{t('admin.addPricing')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-text-muted mb-1 block">Model ID</label>
                <input value={editing.model_id || ''} onChange={(e) => setEditing(prev => ({ ...prev!, model_id: e.target.value }))}
                  placeholder="grsai/nano-banana-pro" className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark font-mono" /></div>
              <div><label className="text-xs text-text-muted mb-1 block">Provider ID</label>
                <input value={editing.provider_id || ''} onChange={(e) => setEditing(prev => ({ ...prev!, provider_id: e.target.value }))}
                  placeholder="grsai" className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark" /></div>
              <div><label className="text-xs text-text-muted mb-1 block">{t('admin.displayName')}</label>
                <input value={editing.display_name || ''} onChange={(e) => setEditing(prev => ({ ...prev!, display_name: e.target.value }))}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark" /></div>
              <div><label className="text-xs text-text-muted mb-1 block">{t('admin.creditsPerImage')}</label>
                <input type="number" min="1" value={editing.credits_per_image || 1} onChange={(e) => setEditing(prev => ({ ...prev!, credits_per_image: parseInt(e.target.value, 10) || 1 }))}
                  className="h-8 w-full rounded border border-border-dark bg-surface-dark px-2 text-xs text-text-dark" /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleSave()} className="h-8 px-4 rounded bg-accent text-white text-xs hover:bg-accent/80">{t('common.save')}</button>
              <button onClick={() => setEditing(null)} className="h-8 px-4 rounded border border-border-dark text-xs text-text-muted hover:bg-bg-dark">{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing({ model_id: '', provider_id: '', display_name: '', credits_per_image: 1 })}
            className="w-full rounded-lg border border-dashed border-border-dark p-4 text-sm text-text-muted hover:text-text-dark hover:border-accent/50 transition-colors flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />{t('admin.addPricing')}
          </button>
        )}
      </div>
    </>
  );
}

/* ==================== USAGE TAB ==================== */

function UsageTab() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userFilter, setUserFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ rows: UsageLog[]; total: number }>('admin_ai_usage', {
        page, pageSize,
        userId: userFilter || undefined,
      });
      setUsage(result.rows);
      setTotal(result.total);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, userFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = statusFilter ? usage.filter(u => u.status === statusFilter) : usage;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-dark">{t('admin.usageLog')}</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-text-muted" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 rounded border border-border-dark bg-bg-dark px-1.5 text-xs text-text-dark">
              <option value="">All Status</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} placeholder="User ID..."
              className="h-7 w-36 rounded border border-border-dark bg-bg-dark pl-8 pr-2 text-xs text-text-dark outline-none focus:border-accent" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-text-muted bg-bg-dark sticky top-0">
              <th className="px-4 py-2.5">{t('admin.time')}</th>
              <th className="px-4 py-2.5">User</th>
              <th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5">Model</th>
              <th className="px-4 py-2.5 text-right">{t('admin.creditsUsed')}</th>
              <th className="px-4 py-2.5">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-border-dark/50 hover:bg-bg-dark/50">
                  <td className="px-4 py-2 text-text-muted">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-2 text-text-dark font-mono">{u.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-text-muted">{u.provider}</td>
                  <td className="px-4 py-2 text-text-muted font-mono">{u.model}</td>
                  <td className="px-4 py-2 text-right font-mono text-accent">{u.credits_used}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${u.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{u.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="px-6 py-2.5 border-t border-border-dark flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('admin.pageInfo', { current: page, total: totalPages, count: total })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </>
  );
}

/* ==================== SYSTEM TAB ==================== */

function SystemTab() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const rows = await invoke<{ key: string; value: string }[]>('admin_system_config', {});
      const map: Record<string, string> = {};
      for (const row of rows) map[row.key] = row.value;
      setConfig(map);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (key: string, value: string) => {
    try {
      await invoke('admin_system_config', { set: true, key, value });
      setConfig(prev => ({ ...prev, [key]: value }));
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const configs = [
    { key: 'signup_bonus_credits', label: t('admin.signupBonusCredits'), desc: t('admin.signupBonusCreditsDesc'), type: 'number' },
    { key: 'registration_enabled', label: t('admin.registrationEnabled'), desc: t('admin.registrationEnabledDesc'), type: 'toggle' },
    { key: 'site_name', label: t('admin.siteName'), desc: t('admin.siteNameDesc'), type: 'text' },
    { key: 'maintenance_mode', label: t('admin.maintenanceMode'), desc: t('admin.maintenanceModeDesc'), type: 'toggle' },
  ];

  return (
    <>
      <div className="px-6 py-4 border-b border-border-dark">
        <h2 className="text-lg font-semibold text-text-dark">{t('admin.systemSettings')}</h2>
        <p className="text-xs text-text-muted mt-1">{t('admin.systemSettingsDesc')}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {configs.map((c) => (
          <div key={c.key} className="rounded-lg border border-border-dark bg-bg-dark p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-dark">{c.label}</div>
                <div className="text-xs text-text-muted mt-0.5">{c.desc}</div>
              </div>
              {c.type === 'toggle' ? (
                <button onClick={() => void handleSave(c.key, config[c.key] === 'true' ? 'false' : 'true')}
                  className={`relative h-6 w-11 rounded-full transition-colors ${config[c.key] === 'true' ? 'bg-accent' : 'bg-border-dark'}`}>
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${config[c.key] === 'true' ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              ) : c.type === 'number' ? (
                <input type="number" min="0" value={config[c.key] || ''} onBlur={(e) => void handleSave(c.key, e.target.value)}
                  onChange={(e) => setConfig(prev => ({ ...prev, [c.key]: e.target.value }))}
                  className="h-8 w-24 rounded border border-border-dark bg-surface-dark px-2 text-sm text-text-dark text-center font-mono" />
              ) : (
                <input value={config[c.key] || ''} onBlur={(e) => void handleSave(c.key, e.target.value)}
                  onChange={(e) => setConfig(prev => ({ ...prev, [c.key]: e.target.value }))}
                  className="h-8 w-48 rounded border border-border-dark bg-surface-dark px-2 text-sm text-text-dark" />
              )}
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
          <div className="text-sm font-medium text-text-dark mb-2">{t('admin.systemInfo')}</div>
          <div className="space-y-1 text-xs text-text-muted">
            <div>Node.js: Server-side</div>
            <div>{t('admin.dataDir')}: .data/</div>
            <div>{t('admin.imagesDir')}: .data/images/</div>
          </div>
        </div>
      </div>
    </>
  );
}
