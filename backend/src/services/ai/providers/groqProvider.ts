import Groq from 'groq-sdk';
import { AIProvider, AIProviderResult } from '../types.js';
import { PROMPTS, MAX_OUTPUT_TOKENS } from '../prompts.js';

export class GroqProvider implements AIProvider {
  public readonly name = 'groq' as const;
  private client: Groq | null = null;
  private currentKey: string | null = null;

  // Currently active & supported Groq text/chat models
  private textModels = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ];

  // Currently active & supported Groq document/OCR models
  private visionModels = [
    'qwen/qwen3.6-27b',
  ];

  public isConfigured(): boolean {
    const apiKey = process.env.GROQ_API_KEY;
    return Boolean(apiKey && apiKey.trim() !== '');
  }

  private getClient(): Groq {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Groq API key is missing or not configured in environment.');
    }

    if (!this.client || this.currentKey !== apiKey.trim()) {
      this.client = new Groq({ apiKey: apiKey.trim() });
      this.currentKey = apiKey.trim();
    }

    return this.client;
  }

  /**
   * Helper to clean raw text and strip markdown code fences safely.
   */
  private cleanJsonResponse(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  public async generateText(
    prompt: string,
    systemInstruction?: string,
    options?: { temperature?: number; jsonMode?: boolean }
  ): Promise<AIProviderResult<string>> {
    const startTime = Date.now();
    const client = this.getClient();

    let lastError: any = null;

    for (const modelName of this.textModels) {
      try {
        const messages: any[] = [];
        if (systemInstruction && systemInstruction.trim()) {
          messages.push({ role: 'system', content: systemInstruction.trim() });
        }
        messages.push({ role: 'user', content: prompt.trim() });

        const completion = await client.chat.completions.create({
          model: modelName,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        });

        const rawText = completion.choices[0]?.message?.content || '';
        const cleaned = this.cleanJsonResponse(rawText);

        if (cleaned && cleaned !== '') {
          const latencyMs = Date.now() - startTime;
          return {
            response: cleaned,
            model: modelName,
            provider: 'groq',
            latencyMs,
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[GroqProvider] Text model ${modelName} failed (${err?.message || err}). Trying fallback...`);
        continue;
      }
    }

    throw lastError || new Error('Groq failed to generate text across active text models (openai/gpt-oss-120b, openai/gpt-oss-20b).');
  }

  /**
   * Helper to extract readable ASCII/text stream fragments from PDF buffers.
   */
  private extractTextFromBuffer(fileBuffer: Buffer): string {
    const raw = fileBuffer.toString('utf-8');
    const printable = raw.match(/[\x20-\x7E]{3,}/g) || [];
    const filtered = printable.filter(
      (str) =>
        !str.startsWith('/') &&
        !str.startsWith('<<') &&
        !str.startsWith('>>') &&
        !str.includes('obj') &&
        !str.includes('endstream')
    );
    return filtered.join('\n').slice(0, 8000);
  }

  public async extractDocumentMedia(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { systemInstruction?: string; userPrompt?: string }
  ): Promise<AIProviderResult<string>> {
    const startTime = Date.now();
    const client = this.getClient();
    const systemInst = options?.systemInstruction || PROMPTS.OCR_SYSTEM_INSTRUCTION;
    const userPromptText = options?.userPrompt || PROMPTS.OCR_USER_PROMPT;

    const isImage = mimeType.startsWith('image/');
    const base64Data = fileBuffer.toString('base64');

    // 1. Try Document / Vision model (qwen/qwen3.6-27b)
    for (const visionModel of this.visionModels) {
      try {
        const userContent: any[] = [{ type: 'text', text: userPromptText }];
        if (isImage) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          });
        } else {
          const extractedText = this.extractTextFromBuffer(fileBuffer);
          userContent.push({
            type: 'text',
            text: `Document Content:\n${extractedText || 'Extract fields from document stream.'}`,
          });
        }

        const completion = await client.chat.completions.create({
          model: visionModel,
          messages: [
            { role: 'system', content: systemInst },
            { role: 'user', content: userContent },
          ],
          temperature: 0.1,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        });

        const rawText = completion.choices[0]?.message?.content || '';
        const cleaned = this.cleanJsonResponse(rawText);

        if (cleaned && cleaned !== '') {
          const latencyMs = Date.now() - startTime;
          return {
            response: cleaned,
            model: visionModel,
            provider: 'groq',
            latencyMs,
          };
        }
      } catch (err: any) {
        console.warn(`[GroqProvider] Vision model ${visionModel} failed (${err?.message || err}). Trying fallback text models...`);
        continue;
      }
    }

    // 2. Fallback to active text models (openai/gpt-oss-120b, openai/gpt-oss-20b)
    const textContent = this.extractTextFromBuffer(fileBuffer);
    const textPrompt = `${userPromptText}\n\nDocument Stream Text:\n${textContent || 'Extract invoice JSON'}`;

    for (const textModel of this.textModels) {
      try {
        const completion = await client.chat.completions.create({
          model: textModel,
          messages: [
            { role: 'system', content: systemInst },
            { role: 'user', content: textPrompt },
          ],
          temperature: 0.1,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        });

        const rawText = completion.choices[0]?.message?.content || '';
        const cleaned = this.cleanJsonResponse(rawText);

        if (cleaned && cleaned !== '') {
          const latencyMs = Date.now() - startTime;
          return {
            response: cleaned,
            model: textModel,
            provider: 'groq',
            latencyMs,
          };
        }
      } catch (err: any) {
        console.warn(`[GroqProvider] Text model ${textModel} failed (${err?.message || err}). Trying next...`);
        continue;
      }
    }

    throw new Error('Groq failed to extract document content across supported models (qwen/qwen3.6-27b, openai/gpt-oss-120b).');
  }
}

export const groqProvider = new GroqProvider();
