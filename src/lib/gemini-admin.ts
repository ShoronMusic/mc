/**
 * STYLE_ADMIN 管理 API 専用 Gemini（mc プロダクトでも GEMINI_API_KEY があれば利用可）
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildGoogleGenerativeModelParams } from '@/lib/gemini-gemma-host';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

export function getAdminGeminiModel(usageContext: string) {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = resolveGenerationModelId(usageContext);
  return genAI.getGenerativeModel(buildGoogleGenerativeModelParams(modelId));
}
