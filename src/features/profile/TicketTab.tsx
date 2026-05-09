import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/commands/transport';
import { useAuthStore } from '@/stores/authStore';
import {
  Plus, ChevronLeft, ChevronRight, Send, RotateCcw, Lock, Search,
  AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, User, Filter,
} from 'lucide-react';

type TicketView = 'list' | 'create' | 'detail';

interface Ticket {
  id: string;
  user_id: string;
  username?: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  created_at: number;
  updated_at: number;
  messageCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
  unreadStaff?: number;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  username?: string;
  content: string;
  is_staff: number;
  created_at: number;
}

interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  open: { icon: AlertCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  in_progress: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  resolved: { icon: CheckCircle, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  closed: { icon: XCircle, color: 'text-text-muted', bg: 'bg-bg-dark' },
};

const priorityColors: Record<string, string> = {
  low: 'text-text-muted', medium: 'text-blue-400', high: 'text-amber-400', urgent: 'text-red-400',
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtFullDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface TicketTabProps {
  viewUserId?: string;
  allTickets?: boolean;
}

export function TicketTab({ viewUserId, allTickets }: TicketTabProps) {
  const { t } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = authUser?.role === 'admin';
  const isViewingSelf = !allTickets && (!viewUserId || viewUserId === authUser?.id);

  const [view, setView] = useState<TicketView>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newPriority, setNewPriority] = useState('medium');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pageSize = 15;

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      if (allTickets || (isAdmin && !isViewingSelf)) {
        const result = await invoke<{ rows: Ticket[]; total: number }>('admin_list_tickets', {
          page, pageSize, status: statusFilter || undefined, search: search || undefined,
        });
        setTickets(result.rows);
        setTotal(result.total);
      } else {
        const result = await invoke<{ rows: Ticket[]; total: number }>('list_my_tickets', {
          page, pageSize, status: statusFilter || undefined,
        });
        setTickets(result.rows);
        setTotal(result.total);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, statusFilter, search, isAdmin, isViewingSelf]);

  const loadTicketDetail = async (ticketId: string) => {
    try {
      const data = await invoke<TicketDetail>('get_ticket', { ticketId });
      setSelectedTicket(data);
      setView('detail');
    } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      await invoke('create_ticket', { title: newTitle, category: newCategory, priority: newPriority, content: newContent });
      setNewTitle('');
      setNewContent('');
      setNewCategory('general');
      setNewPriority('medium');
      setView('list');
      void loadTickets();
    } catch (e) { alert(e instanceof Error ? e.message : '创建失败'); }
    setSubmitting(false);
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      await invoke('reply_ticket', { ticketId: selectedTicket.id, content: replyContent });
      setReplyContent('');
      await loadTicketDetail(selectedTicket.id);
    } catch (e) { alert(e instanceof Error ? e.message : '回复失败'); }
    setReplying(false);
  };

  const handleClose = async (ticketId: string) => {
    try {
      await invoke('close_ticket', { ticketId });
      if (selectedTicket?.id === ticketId) await loadTicketDetail(ticketId);
      void loadTickets();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleReopen = async (ticketId: string) => {
    try {
      await invoke('reopen_ticket', { ticketId });
      if (selectedTicket?.id === ticketId) await loadTicketDetail(ticketId);
      void loadTickets();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleAdminUpdate = async (ticketId: string, field: 'status' | 'priority', value: string) => {
    try {
      await invoke('admin_update_ticket', { ticketId, [field]: value });
      if (selectedTicket?.id === ticketId) await loadTicketDetail(ticketId);
      void loadTickets();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  useEffect(() => {
    if (view === 'list') void loadTickets();
  }, [view, loadTickets]);

  useEffect(() => {
    if (selectedTicket) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.messages?.length]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const categories = [
    { value: 'general', label: t('ticket.categoryGeneral') },
    { value: 'bug', label: t('ticket.categoryBug') },
    { value: 'feature', label: t('ticket.categoryFeature') },
    { value: 'billing', label: t('ticket.categoryBilling') },
    { value: 'other', label: t('ticket.categoryOther') },
  ];

  const priorities = [
    { value: 'low', label: t('ticket.priorityLow') },
    { value: 'medium', label: t('ticket.priorityMedium') },
    { value: 'high', label: t('ticket.priorityHigh') },
    { value: 'urgent', label: t('ticket.priorityUrgent') },
  ];

  const statuses = [
    { value: '', label: t('ticket.statusAll') },
    { value: 'open', label: t('ticket.statusOpen') },
    { value: 'in_progress', label: t('ticket.statusInProgress') },
    { value: 'resolved', label: t('ticket.statusResolved') },
    { value: 'closed', label: t('ticket.statusClosed') },
  ];

  if (view === 'create') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-6 py-4 border-b border-border-dark flex items-center gap-3 bg-surface-dark">
          <button onClick={() => setView('list')} className="p-1 hover:bg-bg-dark rounded">
            <ChevronLeft className="w-4 h-4 text-text-muted" />
          </button>
          <Plus className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-dark">{t('ticket.createTitle')}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">{t('ticket.titleLabel')}</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t('ticket.titlePlaceholder')}
                className="w-full h-9 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none focus:border-accent" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1.5 block">{t('ticket.category')}</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none">
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1.5 block">{t('ticket.priority')}</label>
                <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none">
                  {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">{t('ticket.contentLabel')}</label>
              <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder={t('ticket.contentPlaceholder')} rows={8}
                className="w-full rounded-lg border border-border-dark bg-bg-dark px-3 py-2.5 text-sm text-text-dark outline-none focus:border-accent resize-none" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => void handleCreate()} disabled={submitting || !newTitle.trim() || !newContent.trim()}
                className="h-9 px-5 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 disabled:opacity-40 flex items-center gap-2">
                <Send className="w-3.5 h-3.5" />
                {submitting ? t('ticket.submitting') : t('ticket.submit')}
              </button>
              <button onClick={() => setView('list')}
                className="h-9 px-5 rounded-lg border border-border-dark text-sm text-text-muted hover:bg-bg-dark">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedTicket) {
    const sc = statusConfig[selectedTicket.status] || statusConfig.open;
    const StatusIcon = sc.icon;
    const isOwner = selectedTicket.user_id === authUser?.id;

    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-6 py-4 border-b border-border-dark flex items-center gap-3 bg-surface-dark">
          <button onClick={() => { setView('list'); setSelectedTicket(null); }} className="p-1 hover:bg-bg-dark rounded">
            <ChevronLeft className="w-4 h-4 text-text-muted" />
          </button>
          <MessageSquare className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-dark truncate flex-1">{selectedTicket.title}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] ${sc.bg} ${sc.color} flex items-center gap-1`}>
            <StatusIcon className="w-3 h-3" />
            {t(`ticket.status${selectedTicket.status.charAt(0).toUpperCase() + selectedTicket.status.slice(1).replace('_', '')}`)}
          </span>
          <span className={`text-[11px] ${priorityColors[selectedTicket.priority]}`}>
            {t(`ticket.priority${selectedTicket.priority.charAt(0).toUpperCase() + selectedTicket.priority.slice(1)}`)}
          </span>
        </div>

        <div className="shrink-0 px-6 py-2.5 border-b border-border-dark flex items-center gap-2 text-xs text-text-muted bg-bg-dark/50">
          <span>{t('ticket.category')}: {categories.find(c => c.value === selectedTicket.category)?.label || selectedTicket.category}</span>
          <span>·</span>
          <span>{t('ticket.createdAt')}: {fmtFullDate(selectedTicket.created_at)}</span>
          {!isOwner && selectedTicket.username && (
            <>
              <span>·</span>
              <User className="w-3 h-3" />
              <span>{selectedTicket.username}</span>
            </>
          )}
          <div className="flex-1" />
          {isAdmin && (
            <>
              <select value={selectedTicket.status} onChange={(e) => void handleAdminUpdate(selectedTicket.id, 'status', e.target.value)}
                className="h-6 rounded border border-border-dark bg-surface-dark px-1.5 text-[11px] text-text-dark">
                {statuses.filter(s => s.value).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={selectedTicket.priority} onChange={(e) => void handleAdminUpdate(selectedTicket.id, 'priority', e.target.value)}
                className="h-6 rounded border border-border-dark bg-surface-dark px-1.5 text-[11px] text-text-dark">
                {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </>
          )}
          {isOwner && selectedTicket.status === 'closed' && (
            <button onClick={() => void handleReopen(selectedTicket.id)}
              className="h-6 px-2 rounded text-[11px] text-accent hover:bg-accent/10 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />{t('ticket.reopen')}
            </button>
          )}
          {selectedTicket.status !== 'closed' && (isOwner || isAdmin) && (
            <button onClick={() => void handleClose(selectedTicket.id)}
              className="h-6 px-2 rounded text-[11px] text-text-muted hover:bg-bg-dark flex items-center gap-1">
              <Lock className="w-3 h-3" />{t('ticket.close')}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {selectedTicket.messages.map((msg) => {
              const isMe = msg.user_id === authUser?.id;
              const staffBadge = msg.is_staff ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-accent/10 text-accent ml-1">staff</span>
              ) : null;

              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${
                    isMe ? 'bg-accent/10 border border-accent/20' : 'bg-bg-dark border border-border-dark'
                  }`}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[11px] font-medium text-text-dark">{msg.username || 'user'}</span>
                      {staffBadge}
                      <span className="text-[10px] text-text-muted ml-auto">{fmtDate(msg.created_at)}</span>
                    </div>
                    <div className="text-sm text-text-dark whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {selectedTicket.status !== 'closed' && (
          <div className="shrink-0 px-6 py-3 border-t border-border-dark bg-surface-dark">
            <div className="max-w-2xl mx-auto flex gap-2">
              <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder={t('ticket.replyPlaceholder')} rows={2}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleReply(); } }}
                className="flex-1 rounded-lg border border-border-dark bg-bg-dark px-3 py-2 text-sm text-text-dark outline-none focus:border-accent resize-none" />
              <button onClick={() => void handleReply()} disabled={replying || !replyContent.trim()}
                className="shrink-0 h-10 w-10 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/80 disabled:opacity-40">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="max-w-2xl mx-auto mt-1 text-[10px] text-text-muted">
              {t('ticket.replyHint')}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border-dark flex items-center gap-2 bg-surface-dark">
        <MessageSquare className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-dark">{t('ticket.listTitle')}</span>
        <span className="text-xs text-text-muted">({total})</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-7 rounded border border-border-dark bg-bg-dark pl-6 pr-2 text-xs text-text-dark outline-none">
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {(allTickets || (isAdmin && !isViewingSelf)) && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('ticket.searchPlaceholder')}
                className="h-7 w-36 rounded border border-border-dark bg-bg-dark pl-6 pr-2 text-xs text-text-dark outline-none focus:border-accent" />
            </div>
          )}
          <button onClick={() => setView('create')}
            className="h-7 px-3 rounded bg-accent text-white text-xs hover:bg-accent/80 flex items-center gap-1">
            <Plus className="w-3 h-3" />{t('ticket.create')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">{t('common.loading')}</div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
            <div className="text-sm">{t('ticket.noTickets')}</div>
          </div>
        ) : (
          <div className="divide-y divide-border-dark/50">
            {tickets.map((ticket) => {
              const sc = statusConfig[ticket.status] || statusConfig.open;
              const StatusIcon = sc.icon;
              return (
                <button key={ticket.id} onClick={() => void loadTicketDetail(ticket.id)}
                  className="w-full text-left px-6 py-3.5 hover:bg-bg-dark/50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${sc.bg} ${sc.color} flex items-center gap-1`}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {t(`ticket.status${ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).replace('_', '')}`)}
                    </span>
                    <span className={`text-[10px] ${priorityColors[ticket.priority]}`}>
                      {t(`ticket.priority${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}`)}
                    </span>
                    <span className="text-[10px] text-text-muted">{categories.find(c => c.value === ticket.category)?.label}</span>
                    {(allTickets || (isAdmin && !isViewingSelf)) && ticket.username && (
                      <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5" />{ticket.username}
                      </span>
                    )}
                    <span className="text-[10px] text-text-muted ml-auto">{fmtDate(ticket.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-dark font-medium truncate flex-1">{ticket.title}</span>
                    {ticket.unreadStaff && ticket.unreadStaff > 0 && (
                      <span className="shrink-0 w-5 h-5 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-medium">
                        {ticket.unreadStaff}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-text-muted flex items-center gap-0.5">
                      <MessageSquare className="w-3 h-3" />{ticket.messageCount}
                    </span>
                  </div>
                  {ticket.lastMessage && (
                    <div className="text-xs text-text-muted truncate mt-0.5">{ticket.lastMessage}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="shrink-0 px-6 py-2.5 border-t border-border-dark flex items-center justify-between bg-surface-dark">
          <span className="text-xs text-text-muted">{t('admin.pageInfo', { current: page, total: totalPages, count: total })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="h-7 w-7 flex items-center justify-center rounded border border-border-dark text-text-muted hover:bg-bg-dark disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
