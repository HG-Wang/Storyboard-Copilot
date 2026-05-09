import { create } from 'zustand';
import { getUserSettings, setUserSettings, deleteUserSettings } from '@/commands/userSettings';
import { isDesktopPlatform } from '@/lib/platform';

export interface AuthUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  credits: number;
}

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateCredits: (credits: number) => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    set({ token, user, isAuthenticated: true });
    if (isDesktopPlatform()) {
      void setUserSettings({
        [AUTH_TOKEN_KEY]: token,
        [AUTH_USER_KEY]: JSON.stringify(user),
      });
    }
  },

  logout: () => {
    set({ token: null, user: null, isAuthenticated: false });
    if (isDesktopPlatform()) {
      void deleteUserSettings([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
    }
  },

  updateCredits: (credits) => {
    const user = get().user;
    if (user) {
      const updated = { ...user, credits };
      set({ user: updated });
      if (isDesktopPlatform()) {
        void setUserSettings({ [AUTH_USER_KEY]: JSON.stringify(updated) });
      }
    }
  },

  loadFromStorage: () => {
    if (isDesktopPlatform()) {
      void (async () => {
        try {
          const stored = await getUserSettings();
          const token = stored[AUTH_TOKEN_KEY];
          const userRaw = stored[AUTH_USER_KEY];
          if (token && userRaw) {
            const user = JSON.parse(userRaw) as AuthUser;
            set({ token, user, isAuthenticated: true });
          }
        } catch {
          void deleteUserSettings([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
        }
      })();
      return;
    }

    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const userRaw = localStorage.getItem(AUTH_USER_KEY);
      if (token && userRaw) {
        const user = JSON.parse(userRaw) as AuthUser;
        set({ token, user, isAuthenticated: true });
      }
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  },
}));
