import { getDesktopAppVersion, isDesktopPlatform } from '@/lib/platform';
import { checkLatestReleaseTag } from '../../../commands/update';
import { getUserSettings, setUserSettings } from '@/commands/userSettings';

const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/henjicc/Storyboard-Copilot/releases/latest';
const VERSION_SUPPRESSION_STORAGE_KEY = 'storyboard:update-check:version-suppressions';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion?: string;
  error?: 'network' | 'unknown';
}

interface GithubLatestReleaseResponse {
  tag_name?: string;
}
type VersionSuppressionMode = 'today' | 'forever';

interface VersionSuppressionRecord {
  mode: VersionSuppressionMode;
  dayKey?: string;
}

type VersionSuppressionMap = Record<string, VersionSuppressionRecord>;

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function getLocalDateKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let _cachedSuppressions: VersionSuppressionMap | null = null;

async function readVersionSuppressions(): Promise<VersionSuppressionMap> {
  if (_cachedSuppressions) return _cachedSuppressions;

  try {
    if (isDesktopPlatform()) {
      const stored = await getUserSettings();
      const raw = stored[VERSION_SUPPRESSION_STORAGE_KEY];
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          _cachedSuppressions = parseSuppressionMap(parsed as Record<string, unknown>);
          return _cachedSuppressions;
        }
      }

      const legacyRaw = localStorage.getItem(VERSION_SUPPRESSION_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as unknown;
        if (parsed && typeof parsed === 'object') {
          const map = parseSuppressionMap(parsed as Record<string, unknown>);
          _cachedSuppressions = map;
          void persistVersionSuppressions(map);
          localStorage.removeItem(VERSION_SUPPRESSION_STORAGE_KEY);
          return map;
        }
      }
    } else {
      const raw = localStorage.getItem(VERSION_SUPPRESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          _cachedSuppressions = parseSuppressionMap(parsed as Record<string, unknown>);
          return _cachedSuppressions;
        }
      }
    }
  } catch {
    // ignore
  }

  _cachedSuppressions = {};
  return _cachedSuppressions;
}

function parseSuppressionMap(parsed: Record<string, unknown>): VersionSuppressionMap {
  return Object.entries(parsed).reduce<VersionSuppressionMap>(
    (acc, [version, value]) => {
      if (!version || typeof value !== 'object' || value === null) {
        return acc;
      }
      const mode = (value as { mode?: unknown }).mode;
      if (mode !== 'today' && mode !== 'forever') {
        return acc;
      }
      const dayKey = (value as { dayKey?: unknown }).dayKey;
      acc[version] = {
        mode,
        dayKey: typeof dayKey === 'string' ? dayKey : undefined,
      };
      return acc;
    },
    {}
  );
}

async function persistVersionSuppressions(map: VersionSuppressionMap): Promise<void> {
  const json = JSON.stringify(map);
  try {
    if (isDesktopPlatform()) {
      await setUserSettings({ [VERSION_SUPPRESSION_STORAGE_KEY]: json });
    } else {
      localStorage.setItem(VERSION_SUPPRESSION_STORAGE_KEY, json);
    }
  } catch {
    // ignore storage failures
  }
}

export async function suppressUpdateVersion(version: string, mode: VersionSuppressionMode): Promise<void> {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return;
  }

  const map = await readVersionSuppressions();
  map[normalized] =
    mode === 'today'
      ? {
          mode: 'today',
          dayKey: getLocalDateKey(new Date()),
        }
      : { mode: 'forever' };

  _cachedSuppressions = map;
  void persistVersionSuppressions(map);
}

export async function isUpdateVersionSuppressed(version: string): Promise<boolean> {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return false;
  }

  const map = await readVersionSuppressions();
  const record = map[normalized];
  if (!record) {
    return false;
  }

  if (record.mode === 'forever') {
    return true;
  }

  const today = getLocalDateKey(new Date());
  return record.dayKey === today;
}

function parseVersionParts(version: string): number[] {
  const core = normalizeVersion(version).split('-')[0] ?? '';
  return core.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const currentVersion = normalizeVersion(await getDesktopAppVersion());
    if (!currentVersion) {
      return { hasUpdate: false };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    let latestTag = '';

    if (isDesktopPlatform()) {
      try {
        latestTag = normalizeVersion((await checkLatestReleaseTag()) ?? '');
      } catch {
        return { hasUpdate: false, error: 'network' };
      } finally {
        window.clearTimeout(timeoutId);
      }
    } else {
      try {
        const response = await fetch(GITHUB_LATEST_RELEASE_API, {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return { hasUpdate: false, error: 'network' };
        }

        const data = (await response.json()) as GithubLatestReleaseResponse;
        latestTag = normalizeVersion(data.tag_name ?? '');
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (!latestTag) {
      return { hasUpdate: false };
    }

    if (compareVersions(latestTag, currentVersion) > 0) {
      return {
        hasUpdate: true,
        latestVersion: latestTag,
        currentVersion,
      };
    }

    return { hasUpdate: false };
  } catch {
    return { hasUpdate: false, error: 'unknown' };
  }
}
