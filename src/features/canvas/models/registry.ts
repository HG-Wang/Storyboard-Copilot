import type {
  ImageModelDefinition,
  ImageModelRuntimeContext,
  MediaModelType,
  ModelProviderDefinition,
  ResolutionOption,
  TextModelDefinition,
} from './types';
import { useServerModelStore } from './serverModelStore';
import { isDesktopPlatform } from '@/lib/platform';

const providerModules = import.meta.glob<{ provider: ModelProviderDefinition }>(
  './providers/*.ts',
  { eager: true }
);
const imageModelModules = import.meta.glob<{ imageModel: ImageModelDefinition }>(
  './image/**/*.ts',
  { eager: true }
);
const textModelModules = import.meta.glob<{ textModel: TextModelDefinition }>(
  './text/**/*.ts',
  { eager: true }
);

const hardcodedProviders: ModelProviderDefinition[] = Object.values(providerModules)
  .map((module) => module.provider)
  .filter((provider): provider is ModelProviderDefinition => Boolean(provider))
  .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

const hardcodedImageModels: ImageModelDefinition[] = Object.values(imageModelModules)
  .map((module) => module.imageModel)
  .filter((model): model is ImageModelDefinition => Boolean(model))
  .sort((a, b) => a.id.localeCompare(b.id));

const hardcodedTextModels: TextModelDefinition[] = Object.values(textModelModules)
  .map((module) => module.textModel)
  .filter((model): model is TextModelDefinition => Boolean(model))
  .sort((a, b) => a.id.localeCompare(b.id));

const hardcodedProviderMap = new Map<string, ModelProviderDefinition>(
  hardcodedProviders.map((provider) => [provider.id, provider])
);
const hardcodedImageModelMap = new Map<string, ImageModelDefinition>(
  hardcodedImageModels.map((model) => [model.id, model])
);
const hardcodedTextModelMap = new Map<string, TextModelDefinition>(
  hardcodedTextModels.map((model) => [model.id, model])
);

export const DEFAULT_IMAGE_MODEL_ID = 'kie/nano-banana-2';
export const DEFAULT_TEXT_MODEL_ID = 'ppio/gemini-3.1-flash';

const imageModelAliasMap = new Map<string, string>([
  ['gemini-3.1-flash', 'ppio/gemini-3.1-flash'],
  ['gemini-3.1-flash-edit', 'ppio/gemini-3.1-flash'],
]);

function getStore() {
  return useServerModelStore.getState();
}

export function listImageModels(): ImageModelDefinition[] {
  const store = getStore();
  if (!isDesktopPlatform() && store.loaded && store.models.length > 0) {
    return store.models;
  }
  return hardcodedImageModels;
}

export function listTextModels(): TextModelDefinition[] {
  const store = getStore();
  if (!isDesktopPlatform() && store.loaded && store.textModels.length > 0) {
    return store.textModels;
  }
  return hardcodedTextModels;
}

function filterProvidersByMediaType(
  providers: ModelProviderDefinition[],
  mediaType: MediaModelType
): ModelProviderDefinition[] {
  return providers.filter((p) => p.mediaTypes.includes(mediaType));
}

export function listModelProviders(): ModelProviderDefinition[] {
  const store = getStore();
  if (!isDesktopPlatform() && store.loaded && store.providers.length > 0) {
    return store.providers;
  }
  return hardcodedProviders;
}

export function listImageModelProviders(): ModelProviderDefinition[] {
  return filterProvidersByMediaType(listModelProviders(), 'image');
}

export function listTextModelProviders(): ModelProviderDefinition[] {
  return filterProvidersByMediaType(listModelProviders(), 'text');
}

export function getImageModel(modelId: string): ImageModelDefinition {
  const resolvedModelId = imageModelAliasMap.get(modelId) ?? modelId;
  const store = getStore();

  if (!isDesktopPlatform() && store.loaded && store.models.length > 0) {
    const found = store.models.find((m) => m.id === resolvedModelId);
    if (found) return found;
    return store.models[0];
  }

  return hardcodedImageModelMap.get(resolvedModelId) ?? hardcodedImageModelMap.get(DEFAULT_IMAGE_MODEL_ID)!;
}

export function getTextModel(modelId: string): TextModelDefinition {
  const store = getStore();

  if (!isDesktopPlatform() && store.loaded && store.textModels.length > 0) {
    const found = store.textModels.find((m) => m.id === modelId);
    if (found) return found;
    return store.textModels[0];
  }

  return hardcodedTextModelMap.get(modelId) ?? hardcodedTextModelMap.get(DEFAULT_TEXT_MODEL_ID)!;
}

export function resolveImageModelResolutions(
  model: ImageModelDefinition,
  context: ImageModelRuntimeContext = {}
): ResolutionOption[] {
  const resolvedOptions = model.resolveResolutions?.(context);
  return resolvedOptions && resolvedOptions.length > 0 ? resolvedOptions : model.resolutions;
}

export function resolveImageModelResolution(
  model: ImageModelDefinition,
  requestedResolution: string | undefined,
  context: ImageModelRuntimeContext = {}
): ResolutionOption {
  const resolutionOptions = resolveImageModelResolutions(model, context);
  return (
    (requestedResolution
      ? resolutionOptions.find((item) => item.value === requestedResolution)
      : undefined) ??
    resolutionOptions.find((item) => item.value === model.defaultResolution) ??
    resolutionOptions[0] ??
    model.resolutions[0]
  );
}

export function getModelProvider(providerId: string): ModelProviderDefinition {
  const store = getStore();
  if (!isDesktopPlatform() && store.loaded) {
    const found = store.providers.find((p) => p.id === providerId);
    if (found) return found;
  }
  return (
    hardcodedProviderMap.get(providerId) ?? {
      id: 'unknown',
      name: 'Unknown Provider',
      label: 'Unknown',
      mediaTypes: [],
    }
  );
}
