import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { invoke } from '@/commands/transport';

interface AuthPageProps {
  onLoginSuccess: () => void;
}

export function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? 'auth_login' : 'auth_register';
      const body = mode === 'login'
        ? { username, password }
        : { username, password, email: email || undefined };

      const result = await invoke<{ token: string; user: AuthUser }>(endpoint, body);
      setAuth(result.token, result.user);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  }, [mode, username, password, email, setAuth, onLoginSuccess]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg-dark">
      <div className="w-[min(90vw,400px)] rounded-xl border border-border-dark bg-surface-dark p-8 shadow-2xl">
        <div className="text-center mb-6">
          <img src="/app-icon.png" alt="" className="h-16 w-16 rounded-xl mx-auto mb-3 border border-border-dark" />
          <h1 className="text-xl font-bold text-text-dark">{t('app.title')}</h1>
          <p className="text-sm text-text-muted mt-1">{mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.usernamePlaceholder')}
              className="w-full h-10 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('auth.email')} <span className="text-text-muted/50">({t('auth.optional')})</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="w-full h-10 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="w-full h-10 rounded-lg border border-border-dark bg-bg-dark px-3 text-sm text-text-dark outline-none focus:border-accent"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-xs text-accent hover:underline"
          >
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
          </button>
        </div>
      </div>
    </div>
  );
}
