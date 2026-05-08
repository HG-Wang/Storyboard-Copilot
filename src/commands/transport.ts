import { isDesktopPlatform } from '@/lib/platform';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { useAuthStore } from '@/stores/authStore';

let _tauriInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;

async function getTauriInvoke() {
  if (_tauriInvoke) return _tauriInvoke;
  const { invoke } = await import('@tauri-apps/api/core');
  _tauriInvoke = invoke;
  return _tauriInvoke;
}

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktopPlatform()) {
    const tauriInvoke = await getTauriInvoke();
    return await tauriInvoke<T>(command, args);
  }

  const baseUrl = getBackendBaseUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const token = useAuthStore.getState().token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/api/${command}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args ?? {}),
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('登录已过期，请重新登录');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Backend error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}
