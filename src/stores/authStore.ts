import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  credits: number;
}

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
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateCredits: (credits) => {
    const user = get().user;
    if (user) {
      const updated = { ...user, credits };
      localStorage.setItem('auth_user', JSON.stringify(updated));
      set({ user: updated });
    }
  },

  loadFromStorage: () => {
    try {
      const token = localStorage.getItem('auth_token');
      const userRaw = localStorage.getItem('auth_user');
      if (token && userRaw) {
        const user = JSON.parse(userRaw) as AuthUser;
        set({ token, user, isAuthenticated: true });
      }
    } catch {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  },
}));
