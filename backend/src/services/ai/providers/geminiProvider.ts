import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderResult } from '../types.js';
import { PROMPTS, DEFAULT_GEMINI_MODEL, MAX_OUTPUT_TOKENS } from '../prompts.js';

export class GeminiProvider implements AIProvider {
  public readonly name = 'gemini' as const;
  private client: GoogleGenAI | null = null;
  private currentKey: string | null = null;
  private modelFallbackQueue = [
    process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];

  public isConfigured(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    return Boolean(apiKey && apiKey.trim() !== '');
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is missing or not configured in environment.');
    }

    if (!this.client || this.currentKey !== apiKey.trim()) {
      this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.currentKey = apiKey.trim();
    }

    return this.client;
  }

  private getPrimaryModel(): string {
    return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  }

  private async executeWithModelFallback(
    runner: (client: GoogleGenAI, modelName: string) => Promise<string>
  ): Promise<{ text: string; effectiveModel: string }> {
    const client = this.getClient();
    const primary = this.getPrimaryModel();
    const uniqueModels = Array.from(new Set([primary, ...this.modelFallbackQueue]));

    let lastError: any = null;

    for (const modelName of uniqueModels) {
      try {
        const text = await runner(client, modelName);
        if (text && text.trim() !== '') {
          return { text: text.trim(), effectiveModel: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();
        if (msg.includes('not_found') || msg.includes('404') || msg.includes('is not found')) {
          console.warn(`[GeminiProvider] Model ${modelName} 404/not available. Trying fallback...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Gemini failed to generate content across available models.');
  }

  public async generateText(
    prompt: string,
    systemInstruction?: string,
    options?: { temperature?: number; jsonMode?: boolean }
  ): Promise<AIProviderResult<string>> {
    const startTime = Date.now();

    const { text, effectiveModel } = await this.executeWithModelFallback((client, modelName) =>
      client.models
        .generateContent({
          model: modelName,
          contents: prompt.trim(),
          config: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            responseMimeType: options?.jsonMode ? 'application/json' : undefined,
          },
        })
        .then((res) => res.text || '')
    );

    const latencyMs = Date.now() - startTime;

    return {
      response: text,
      model: effectiveModel,
      provider: 'gemini',
      latencyMs,
    };
  }

  public async extractDocumentMedia(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { systemInstruction?: string; userPrompt?: string }
  ): Promise<AIProviderResult<string>> {
    const startTime = Date.now();
    const base64Data = fileBuffer.toString('base64');

    const systemInst = options?.systemInstruction || PROMPTS.OCR_SYSTEM_INSTRUCTION;
    const userPromptText = options?.userPrompt || PROMPTS.OCR_USER_PROMPT;

    const { text, effectiveModel } = await this.executeWithModelFallback((client, modelName) =>
      client.models
        .generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: userPromptText,
                },
              ],
            },
          ],
          config: {
            systemInstruction: systemInst,
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
          },
        })
        .then((res) => res.text || '')
    );

    const latencyMs = Date.now() - startTime;

    return {
      response: text,
      model: effectiveModel,
      provider: 'gemini',
      latencyMs,
    };
  }
}

export const geminiProvider = new GeminiProvider();
