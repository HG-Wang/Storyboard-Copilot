import type { TextModelDefinition } from '../../types';

export const textModel: TextModelDefinition = {
  id: 'ppio/gemini-3.1-flash',
  mediaType: 'text',
  displayName: 'Gemini 3.1 Flash',
  providerId: 'ppio',
  maxTokens: 8192,
  creditsPerRequest: 1,
};
