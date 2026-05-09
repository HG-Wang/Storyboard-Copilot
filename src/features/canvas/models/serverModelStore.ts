import { create } from 'zustand';
import type { ImageModelDefinition, ModelProviderDefinition, TextModelDefinition } from './types';
import { invoke } from '@/commands/transport';
import { isDesktopPlatform } from '@/lib/platform';

interface ServerModel {
  model_id: string;
  provider_id: string;
  display_name: string;
  credits_per_image: number;
}

interface ServerTextModel {
  model_id: string;
  provider_id: string;
  display_name: string;
  credits_per_request: number;
  max_tokens: number;
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

function buildTextModelDef(sm: ServerTextModel): TextModelDefinition {
  return {
    id: sm.model_id,
    mediaType: 'text',
    displayName: sm.display_name,
    providerId: sm.provider_id,
    maxTokens: sm.max_tokens,
    creditsPerRequest: sm.credits_per_request,
  };
}

interface ServerModelState {
  models: ImageModelDefinition[];
  textModels: TextModelDefinition[];
  providers: ModelProviderDefinition[];
  loaded: boolean;
  load: () => Promise<void>;
}

export const useServerModelStore = create<ServerModelState>((set, get) => ({
  models: [],
  textModels: [],
  providers: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    if (isDesktopPlatform()) { set({ loaded: true }); return; }
    try {
      const [serverModels, serverTextModels] = await Promise.all([
        invoke<ServerModel[]>('list_models'),
        invoke<ServerTextModel[]>('list_text_models').catch(() => []),
      ]);

      const providerMediaTypeMap = new Map<string, Set<'image' | 'text'>>();

      let models: ImageModelDefinition[] = [];
      if (Array.isArray(serverModels) && serverModels.length > 0) {
        models = serverModels.map(buildModelDef);
        for (const m of serverModels) {
          if (!providerMediaTypeMap.has(m.provider_id)) {
            providerMediaTypeMap.set(m.provider_id, new Set());
          }
          providerMediaTypeMap.get(m.provider_id)!.add('image');
        }
      }

      let textModels: TextModelDefinition[] = [];
      if (Array.isArray(serverTextModels) && serverTextModels.length > 0) {
        textModels = serverTextModels.map(buildTextModelDef);
        for (const m of serverTextModels) {
          if (!providerMediaTypeMap.has(m.provider_id)) {
            providerMediaTypeMap.set(m.provider_id, new Set());
          }
          providerMediaTypeMap.get(m.provider_id)!.add('text');
        }
      }

      const providers: ModelProviderDefinition[] = Array.from(providerMediaTypeMap.entries()).map(
        ([providerId, mediaTypes]) => ({
          id: providerId,
          name: providerId,
          label: providerId,
          mediaTypes: Array.from(mediaTypes),
        })
      );

      set({ models, textModels, providers, loaded: true });
    } catch (e) {
      console.warn('[serverModels] load failed:', e);
      set({ loaded: true });
    }
  },
}));
