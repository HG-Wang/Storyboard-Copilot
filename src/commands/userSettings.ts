import { invoke } from './transport';
import { isDesktopPlatform } from '@/lib/platform';

export async function getUserSettings(): Promise<Record<string, string>> {
  if (!isDesktopPlatform()) return {};
  return await invoke<Record<string, string>>('get_user_settings');
}

export async function setUserSettings(settings: Record<string, string>): Promise<void> {
  if (!isDesktopPlatform()) return;
  await invoke('set_user_settings', { settings });
}

export async function deleteUserSettings(keys: string[]): Promise<void> {
  if (!isDesktopPlatform()) return;
  await invoke('delete_user_settings', { keys });
}
