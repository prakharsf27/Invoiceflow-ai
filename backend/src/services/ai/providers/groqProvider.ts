import Groq from 'groq-sdk';
import { AIProvider, AIProviderResult } from '../types.js';
import { PROMPTS, MAX_OUTPUT_TOKENS } from '../prompts.js';

export class GroqProvider implements AIProvider {
  public readonly name = 'groq' as const;
  private client: Groq | null = null;
  private currentKey: string | null = null;

  private textModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
  ];

  private visionModels = [
    'llama-3.2-11b-vision-instruct',
    'llama-3.2-90b-vision-instruct',
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

        const text = completion.choices[0]?.message?.content || '';
        if (text && text.trim() !== '') {
          const latencyMs = Date.now() - startTime;
          return {
            response: text.trim(),
            model: modelName,
            provider: 'groq',
            latencyMs,
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[GroqProvider] Model ${modelName} failed (${err?.message || err}). Trying fallback model...`);
        continue;
      }
    }

    throw lastError || new Error('Groq failed to generate text across available models.');
  }

  /**
   * Helper to extract readable ASCII/text stream fragments from PDF buffers.
   */
  private extractTextFromBuffer(fileBuffer: Buffer): string {
    const raw = fileBuffer.toString('utf-8');
    // Extract printable strings of length >= 3
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

    if (isImage) {
      // Use Groq Vision Models for Image OCR Extraction
      for (const visionModel of this.visionModels) {
        try {
          const completion = await client.chat.completions.create({
            model: visionModel,
            messages: [
              { role: 'system', content: systemInst },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userPromptText },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Data}`,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: MAX_OUTPUT_TOKENS,
            response_format: { type: 'json_object' },
          });

          const text = completion.choices[0]?.message?.content || '';
          if (text && text.trim() !== '') {
            const latencyMs = Date.now() - startTime;
            return {
              response: text.trim(),
              model: visionModel,
              provider: 'groq',
              latencyMs,
            };
          }
        } catch (err: any) {
          console.warn(`[GroqProvider] Vision model ${visionModel} failed (${err?.message}). Fallback to text model...`);
          continue;
        }
      }
    }

    // PDF or fallback text processing using Groq text models
    const extractedText = this.extractTextFromBuffer(fileBuffer);
    const combinedPrompt = `${userPromptText}\n\nDocument Text Content Stream:\n${extractedText || 'No plain text extracted. Extract fields based on available document structure.'}`;

    for (const textModel of this.textModels) {
      try {
        const completion = await client.chat.completions.create({
          model: textModel,
          messages: [
            { role: 'system', content: systemInst },
            { role: 'user', content: combinedPrompt },
          ],
          temperature: 0.1,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        });

        const text = completion.choices[0]?.message?.content || '';
        if (text && text.trim() !== '') {
          const latencyMs = Date.now() - startTime;
          return {
            response: text.trim(),
            model: textModel,
            provider: 'groq',
            latencyMs,
          };
        }
      } catch (err: any) {
        console.warn(`[GroqProvider] Text model ${textModel} failed (${err?.message}). Trying fallback...`);
        continue;
      }
    }

    throw new Error('Groq failed to extract document content.');
  }
}

export const groqProvider = new GroqProvider();
