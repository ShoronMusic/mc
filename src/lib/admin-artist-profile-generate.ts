import type { GenerationConfig } from '@google/generative-ai';
import {
  extractTextFromGenerateContentResponse,
} from '@/lib/gemini-gemma-host';
import { logGeminiUsage, type GeminiUsageLogMeta } from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { getAdminGeminiModel } from '@/lib/gemini-admin';
import {
  buildAdminArtistProfilePrompt,
  type AdminArtistProfileCatalog,
} from '@/lib/admin-artist-profile-prompt';
import {
  extractJsonObjectFromGeminiText,
  parseGeminiArtistProfileFields,
  type AdminArtistProfileDraft,
} from '@/lib/admin-artist-profile-parse';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';

const USAGE_CONTEXT = 'admin_artist_profile_generate';

export type GenerateAdminArtistProfileResult =
  | { ok: true; draft: AdminArtistProfileDraft; model: string; rawFields: Record<string, unknown> }
  | { ok: false; error: string };

export async function generateAdminArtistProfile(params: {
  artistName: string;
  catalog?: AdminArtistProfileCatalog;
  userId?: string | null;
}): Promise<GenerateAdminArtistProfileResult> {
  const artistName = params.artistName.trim();
  if (!artistName) {
    return { ok: false, error: 'アーティスト名が空です。' };
  }

  const model = getAdminGeminiModel(USAGE_CONTEXT);
  if (!model) {
    return { ok: false, error: 'GEMINI_API_KEY が未設定です。' };
  }

  const catalog = params.catalog ?? 'domestic';
  const prompt = buildAdminArtistProfilePrompt(artistName, catalog);
  const modelId = resolveGenerationModelId(USAGE_CONTEXT);

  const generationConfig: GenerationConfig = {
    temperature: 0.35,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  };

  const usageMeta: GeminiUsageLogMeta = { userId: params.userId ?? null };

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    logGeminiUsage(USAGE_CONTEXT, result.response);
    await persistGeminiUsageLog(USAGE_CONTEXT, result.response.usageMetadata, {
      userId: usageMeta.userId ?? null,
    });

    const text = extractTextFromGenerateContentResponse(result.response, modelId);
    if (!text.trim()) {
      return { ok: false, error: 'Gemini の応答が空でした。' };
    }

    const fields = extractJsonObjectFromGeminiText(text);
    if (!fields) {
      return { ok: false, error: '生成結果を JSON として解釈できませんでした。' };
    }

    const draft = parseGeminiArtistProfileFields(fields, artistName, catalog);
    return { ok: true, draft, model: modelId, rawFields: fields };
  } catch (e) {
    console.error('[admin-artist-profile-generate]', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Gemini API の呼び出しに失敗しました。',
    };
  }
}
