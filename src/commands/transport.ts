import { isDesktopPlatform } from '@/lib/platform';
import { getBackendBaseUrl } from '@/lib/backendUrl';

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
  const response = await fetch(`${baseUrl}/api/${command}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Backend error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}
