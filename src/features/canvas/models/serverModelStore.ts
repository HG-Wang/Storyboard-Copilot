import { create } from 'zustand';
import type { ImageModelDefinition, ModelProviderDefinition } from './types';
import { invoke } from '@/commands/transport';
import { isDesktopPlatform } from '@/lib/platform';

interface ServerModel {
  model_id: string;
  provider_id: string;
  display_name: string;
  credits_per_image: number;
}

const DEFAULT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const DEFAULT_RESOLUTIONS = [
  { value: '512x512', label: '512' },
  { value: '1024x1024', label: '1024' },
];

function buildModelDef(sm: ServerModel): ImageModelDefinition {
  return {
    id: sm.model_id,
    mediaType: 'image',
    displayName: sm.display_name,
    providerId: sm.provider_id,
    description: `${sm.provider_id} · ${sm.display_name}`,
    eta: '1min',
    defaultAspectRatio: '1:1',
    defaultResolution: '1024x1024',
    aspectRatios: DEFAULT_ASPECT_RATIOS.map((v) => ({ value: v, label: v })),
    resolutions: DEFAULT_RESOLUTIONS,
    resolveRequest: () => ({
      requestModel: sm.model_id,
      modeLabel: '生成模式',
    }),
  };
}

interface ServerModelState {
  models: ImageModelDefinition[];
  providers: ModelProviderDefinition[];
  loaded: boolean;
  load: () => Promise<void>;
}

export const useServerModelStore = create<ServerModelState>((set, get) => ({
  models: [],
  providers: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    if (isDesktopPlatform()) { set({ loaded: true }); return; }
    try {
      const serverModels = await invoke<ServerModel[]>('list_models');
      if (Array.isArray(serverModels) && serverModels.length > 0) {
        const models = serverModels.map(buildModelDef);
        const providerMap = new Map<string, ModelProviderDefinition>();
        for (const m of serverModels) {
          if (!providerMap.has(m.provider_id)) {
            providerMap.set(m.provider_id, { id: m.provider_id, name: m.provider_id, label: m.provider_id });
          }
        }
        set({ models, providers: Array.from(providerMap.values()), loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.warn('[serverModels] load failed:', e);
      set({ loaded: true });
    }
  },
}));

