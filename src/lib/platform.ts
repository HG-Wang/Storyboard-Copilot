let _isDesktop: boolean | null = null;

export function isDesktopPlatform(): boolean {
  if (_isDesktop !== null) return _isDesktop;
  try {
    // Dynamic import to avoid webpack/vite errors when @tauri-apps is unavailable
    _isDesktop = false;
    return _isDesktop;
  } catch {
    _isDesktop = false;
    return _isDesktop;
  }
}

// Lazy-init the Tauri check safely
async function initDesktopCheck() {
  if (_isDesktop !== null) return;
  try {
    const mod = await import('@tauri-apps/api/core');
    _isDesktop = mod.isTauri();
  } catch {
    _isDesktop = false;
  }
}
initDesktopCheck();

export async function getDesktopAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return '';
  }
}

export async function getDesktopWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function openDesktopUrl(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

export async function openDesktopFileDialog(options?: { directory?: boolean; multiple?: boolean; title?: string }): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    directory: options?.directory ?? false,
    multiple: options?.multiple ?? false,
    title: options?.title,
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}

export async function saveDesktopFileDialog(options?: { defaultPath?: string }): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const result = await save({
    defaultPath: options?.defaultPath,
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}

export async function openDesktopPath(path: string): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}

export async function revealItemInDesktopDir(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

export async function joinDesktopPath(...segments: string[]): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  return await join(...segments);
}

export function openUrlSafe(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
