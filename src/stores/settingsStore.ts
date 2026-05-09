import { create } from 'zustand';
import { getUserSettings, setUserSettings } from '@/commands/userSettings';
import {
  DEFAULT_GRSAI_CREDIT_TIER_ID,
  PRICE_DISPLAY_CURRENCY_MODES,
  type GrsaiCreditTierId,
  type PriceDisplayCurrencyMode,
} from '@/features/canvas/pricing/types';
import { isDesktopPlatform } from '@/lib/platform';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';
export type ProviderApiKeys = Record<string, string>;
export const DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL = 'nano-banana-pro';

const SETTINGS_STORAGE_KEY = 'settings-v10';

interface PersistedSettings {
  apiKeys?: ProviderApiKeys;
  grsaiNanoBananaProModel?: string;
  hideProviderGuidePopover?: boolean;
  downloadPresetPaths?: string[];
  useUploadFilenameAsNodeTitle?: boolean;
  storyboardGenKeepStyleConsistent?: boolean;
  storyboardGenDisableTextInImage?: boolean;
  storyboardGenAutoInferEmptyFrame?: boolean;
  ignoreAtTagWhenCopyingAndGenerating?: boolean;
  enableStoryboardGenGridPreviewShortcut?: boolean;
  showStoryboardGenAdvancedRatioControls?: boolean;
  showNodePrice?: boolean;
  priceDisplayCurrencyMode?: PriceDisplayCurrencyMode | string;
  usdToCnyRate?: number | string;
  preferDiscountedPrice?: boolean;
  grsaiCreditTierId?: GrsaiCreditTierId | string;
  uiRadiusPreset?: UiRadiusPreset;
  themeTonePreset?: ThemeTonePreset;
  accentColor?: string;
  canvasEdgeRoutingMode?: CanvasEdgeRoutingMode | string;
  autoCheckAppUpdateOnLaunch?: boolean;
  enableUpdateDialog?: boolean;
}

interface MigratedSettings {
  apiKeys: ProviderApiKeys;
  grsaiNanoBananaProModel: string;
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
}

interface SettingsState {
  isHydrated: boolean;
  apiKeys: ProviderApiKeys;
  grsaiNanoBananaProModel: string;
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  loadSettings: () => Promise<void>;
  setProviderApiKey: (providerId: string, key: string) => void;
  setGrsaiNanoBananaProModel: (model: string) => void;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setDownloadPresetPaths: (paths: string[]) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setShowNodePrice: (enabled: boolean) => void;
  setPriceDisplayCurrencyMode: (mode: PriceDisplayCurrencyMode) => void;
  setUsdToCnyRate: (rate: number) => void;
  setPreferDiscountedPrice: (enabled: boolean) => void;
  setGrsaiCreditTierId: (tierId: GrsaiCreditTierId) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
  setAutoCheckAppUpdateOnLaunch: (enabled: boolean) => void;
  setEnableUpdateDialog: (enabled: boolean) => void;
}

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return '#3B82F6';
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeApiKey(input: string): string {
  return input.trim();
}

function normalizePriceDisplayCurrencyMode(
  input: PriceDisplayCurrencyMode | string | null | undefined
): PriceDisplayCurrencyMode {
  return PRICE_DISPLAY_CURRENCY_MODES.includes(input as PriceDisplayCurrencyMode)
    ? (input as PriceDisplayCurrencyMode)
    : 'auto';
}

function normalizeUsdToCnyRate(input: number | string | null | undefined): number {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 7.2;
  }

  return Math.min(100, Math.max(0.01, Math.round(numeric * 100) / 100));
}

function normalizeGrsaiCreditTierId(
  input: GrsaiCreditTierId | string | null | undefined
): GrsaiCreditTierId {
  switch (input) {
    case 'tier-10':
    case 'tier-20':
    case 'tier-49':
    case 'tier-99':
    case 'tier-499':
    case 'tier-999':
      return input;
    default:
      return DEFAULT_GRSAI_CREDIT_TIER_ID;
  }
}

function normalizeGrsaiNanoBananaProModel(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (trimmed === DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL || trimmed.startsWith('nano-banana-pro-')) {
    return trimmed;
  }
  return DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL;
}

function normalizeCanvasEdgeRoutingMode(
  input: CanvasEdgeRoutingMode | string | null | undefined
): CanvasEdgeRoutingMode {
  if (input === 'orthogonal' || input === 'smartOrthogonal' || input === 'spline') {
    return input;
  }
  return 'spline';
}

function normalizeApiKeys(input: ProviderApiKeys | null | undefined): ProviderApiKeys {
  if (!input) {
    return {};
  }

  return Object.entries(input).reduce<ProviderApiKeys>((acc, [providerId, key]) => {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      return acc;
    }

    acc[normalizedProviderId] = normalizeApiKey(key);
    return acc;
  }, {});
}

export function hasConfiguredApiKey(apiKeys: ProviderApiKeys): boolean {
  return getConfiguredApiKeyCount(apiKeys) > 0;
}

export function getConfiguredApiKeyCount(
  apiKeys: ProviderApiKeys,
  providerIds?: readonly string[]
): number {
  const keysToCount = providerIds
    ? providerIds.map((providerId) => apiKeys[providerId] ?? '')
    : Object.values(apiKeys);

  return keysToCount.reduce((count, key) => {
    return normalizeApiKey(key).length > 0 ? count + 1 : count;
  }, 0);
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(getState: () => SettingsState) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    void persistToSQLite(getState());
  }, 300);
}

async function persistToSQLite(state: SettingsState) {
  const payload: PersistedSettings = {
    apiKeys: state.apiKeys,
    grsaiNanoBananaProModel: state.grsaiNanoBananaProModel,
    hideProviderGuidePopover: state.hideProviderGuidePopover,
    downloadPresetPaths: state.downloadPresetPaths,
    useUploadFilenameAsNodeTitle: state.useUploadFilenameAsNodeTitle,
    storyboardGenKeepStyleConsistent: state.storyboardGenKeepStyleConsistent,
    storyboardGenDisableTextInImage: state.storyboardGenDisableTextInImage,
    storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame,
    ignoreAtTagWhenCopyingAndGenerating: state.ignoreAtTagWhenCopyingAndGenerating,
    enableStoryboardGenGridPreviewShortcut: state.enableStoryboardGenGridPreviewShortcut,
    showStoryboardGenAdvancedRatioControls: state.showStoryboardGenAdvancedRatioControls,
    showNodePrice: state.showNodePrice,
    priceDisplayCurrencyMode: state.priceDisplayCurrencyMode,
    usdToCnyRate: state.usdToCnyRate,
    preferDiscountedPrice: state.preferDiscountedPrice,
    grsaiCreditTierId: state.grsaiCreditTierId,
    uiRadiusPreset: state.uiRadiusPreset,
    themeTonePreset: state.themeTonePreset,
    accentColor: state.accentColor,
    canvasEdgeRoutingMode: state.canvasEdgeRoutingMode,
    autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch,
    enableUpdateDialog: state.enableUpdateDialog,
  };
  try {
    await setUserSettings({ [SETTINGS_STORAGE_KEY]: JSON.stringify(payload) });
  } catch (e) {
    console.error('[settingsStore] failed to persist settings to SQLite', e);
  }
}

function migratePersistedSettings(raw: PersistedSettings): MigratedSettings {
  return {
    apiKeys: normalizeApiKeys(raw.apiKeys),
    grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(raw.grsaiNanoBananaProModel),
    hideProviderGuidePopover: raw.hideProviderGuidePopover ?? false,
    downloadPresetPaths: raw.downloadPresetPaths ?? [],
    useUploadFilenameAsNodeTitle: raw.useUploadFilenameAsNodeTitle ?? true,
    storyboardGenKeepStyleConsistent: raw.storyboardGenKeepStyleConsistent ?? true,
    storyboardGenDisableTextInImage: raw.storyboardGenDisableTextInImage ?? true,
    storyboardGenAutoInferEmptyFrame: raw.storyboardGenAutoInferEmptyFrame ?? true,
    ignoreAtTagWhenCopyingAndGenerating: raw.ignoreAtTagWhenCopyingAndGenerating ?? true,
    enableStoryboardGenGridPreviewShortcut: raw.enableStoryboardGenGridPreviewShortcut ?? false,
    showStoryboardGenAdvancedRatioControls: raw.showStoryboardGenAdvancedRatioControls ?? false,
    showNodePrice: raw.showNodePrice ?? true,
    priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(raw.priceDisplayCurrencyMode),
    usdToCnyRate: normalizeUsdToCnyRate(raw.usdToCnyRate),
    preferDiscountedPrice: raw.preferDiscountedPrice ?? false,
    grsaiCreditTierId: normalizeGrsaiCreditTierId(raw.grsaiCreditTierId),
    uiRadiusPreset: raw.uiRadiusPreset ?? 'default',
    themeTonePreset: raw.themeTonePreset ?? 'neutral',
    accentColor: raw.accentColor ? normalizeHexColor(raw.accentColor) : '#3B82F6',
    canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(raw.canvasEdgeRoutingMode),
    autoCheckAppUpdateOnLaunch: raw.autoCheckAppUpdateOnLaunch ?? true,
    enableUpdateDialog: raw.enableUpdateDialog ?? true,
  };
}

function tryMigrateFromLocalStorage(): MigratedSettings | null {
  if (isDesktopPlatform()) {
    try {
      const raw = localStorage.getItem('settings-storage');
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: PersistedSettings; version?: number };
        const legacyState = parsed.state ?? parsed;
        if (legacyState && typeof legacyState === 'object') {
          localStorage.removeItem('settings-storage');
          return migratePersistedSettings(legacyState as PersistedSettings);
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  isHydrated: false,
  apiKeys: {},
  grsaiNanoBananaProModel: DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL,
  hideProviderGuidePopover: false,
  downloadPresetPaths: [],
  useUploadFilenameAsNodeTitle: true,
  storyboardGenKeepStyleConsistent: true,
  storyboardGenDisableTextInImage: true,
  storyboardGenAutoInferEmptyFrame: true,
  ignoreAtTagWhenCopyingAndGenerating: true,
  enableStoryboardGenGridPreviewShortcut: false,
  showStoryboardGenAdvancedRatioControls: false,
  showNodePrice: true,
  priceDisplayCurrencyMode: 'auto',
  usdToCnyRate: 7.2,
  preferDiscountedPrice: false,
  grsaiCreditTierId: DEFAULT_GRSAI_CREDIT_TIER_ID,
  uiRadiusPreset: 'default',
  themeTonePreset: 'neutral',
  accentColor: '#3B82F6',
  canvasEdgeRoutingMode: 'spline',
  autoCheckAppUpdateOnLaunch: true,
  enableUpdateDialog: true,

  loadSettings: async () => {
    try {
      const stored = await getUserSettings();
      const rawJson = stored[SETTINGS_STORAGE_KEY];
      if (rawJson) {
        const parsed = JSON.parse(rawJson) as PersistedSettings;
        const migrated = migratePersistedSettings(parsed);
        set({ ...migrated, isHydrated: true });
        return;
      }

      const legacy = tryMigrateFromLocalStorage();
      if (legacy) {
        set({ ...legacy, isHydrated: true });
        void persistToSQLite({ ...get(), ...legacy });
        return;
      }
    } catch (e) {
      console.error('[settingsStore] failed to load settings from SQLite', e);
    }
    set({ isHydrated: true });
  },

  setProviderApiKey: (providerId, key) => {
    set((state) => ({
      apiKeys: {
        ...state.apiKeys,
        [providerId]: normalizeApiKey(key),
      },
    }));
    schedulePersist(get);
  },
  setGrsaiNanoBananaProModel: (model) => {
    set({ grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(model) });
    schedulePersist(get);
  },
  setHideProviderGuidePopover: (hide) => {
    set({ hideProviderGuidePopover: hide });
    schedulePersist(get);
  },
  setDownloadPresetPaths: (paths) => {
    const uniquePaths = Array.from(
      new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))
    ).slice(0, 8);
    set({ downloadPresetPaths: uniquePaths });
    schedulePersist(get);
  },
  setUseUploadFilenameAsNodeTitle: (enabled) => {
    set({ useUploadFilenameAsNodeTitle: enabled });
    schedulePersist(get);
  },
  setStoryboardGenKeepStyleConsistent: (enabled) => {
    set({ storyboardGenKeepStyleConsistent: enabled });
    schedulePersist(get);
  },
  setStoryboardGenDisableTextInImage: (enabled) => {
    set({ storyboardGenDisableTextInImage: enabled });
    schedulePersist(get);
  },
  setStoryboardGenAutoInferEmptyFrame: (enabled) => {
    set({ storyboardGenAutoInferEmptyFrame: enabled });
    schedulePersist(get);
  },
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled) => {
    set({ ignoreAtTagWhenCopyingAndGenerating: enabled });
    schedulePersist(get);
  },
  setEnableStoryboardGenGridPreviewShortcut: (enabled) => {
    set({ enableStoryboardGenGridPreviewShortcut: enabled });
    schedulePersist(get);
  },
  setShowStoryboardGenAdvancedRatioControls: (enabled) => {
    set({ showStoryboardGenAdvancedRatioControls: enabled });
    schedulePersist(get);
  },
  setShowNodePrice: (enabled) => {
    set({ showNodePrice: enabled });
    schedulePersist(get);
  },
  setPriceDisplayCurrencyMode: (priceDisplayCurrencyMode) => {
    set({
      priceDisplayCurrencyMode:
        normalizePriceDisplayCurrencyMode(priceDisplayCurrencyMode),
    });
    schedulePersist(get);
  },
  setUsdToCnyRate: (usdToCnyRate) => {
    set({ usdToCnyRate: normalizeUsdToCnyRate(usdToCnyRate) });
    schedulePersist(get);
  },
  setPreferDiscountedPrice: (enabled) => {
    set({ preferDiscountedPrice: enabled });
    schedulePersist(get);
  },
  setGrsaiCreditTierId: (grsaiCreditTierId) => {
    set({ grsaiCreditTierId: normalizeGrsaiCreditTierId(grsaiCreditTierId) });
    schedulePersist(get);
  },
  setUiRadiusPreset: (uiRadiusPreset) => {
    set({ uiRadiusPreset });
    schedulePersist(get);
  },
  setThemeTonePreset: (themeTonePreset) => {
    set({ themeTonePreset });
    schedulePersist(get);
  },
  setAccentColor: (color) => {
    set({ accentColor: normalizeHexColor(color) });
    schedulePersist(get);
  },
  setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) => {
    set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) });
    schedulePersist(get);
  },
  setAutoCheckAppUpdateOnLaunch: (enabled) => {
    set({ autoCheckAppUpdateOnLaunch: enabled });
    schedulePersist(get);
  },
  setEnableUpdateDialog: (enabled) => {
    set({ enableUpdateDialog: enabled });
    schedulePersist(get);
  },
}));
