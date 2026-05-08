import { invoke } from './transport';
import { isDesktopPlatform } from '@/lib/platform';

const isTauri = () => isDesktopPlatform();

export async function checkLatestReleaseTag(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const tag = await invoke<string | null>('check_latest_release_tag');
  return tag ? tag.trim() : null;
}
