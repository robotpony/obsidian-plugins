import { LLMClient as SharedLLMClient, LLMProviderSettings } from "../../shared";
import { SpaceCommandSettings } from "./types";

export interface LLMResponse {
  success: boolean;
  definition?: string;
  result?: string;
  error?: string;
}

/**
 * Convert Space Command settings to shared LLM provider settings.
 */
function toProviderSettings(settings: SpaceCommandSettings): LLMProviderSettings {
  return {
    provider: settings.llmProvider,
    ollamaEndpoint: settings.llmUrl,
    ollamaModel: settings.llmModel,
    openaiApiKey: settings.llmOpenaiApiKey,
    openaiModel: settings.llmOpenaiModel,
    geminiApiKey: settings.llmGeminiApiKey,
    geminiModel: settings.llmGeminiModel,
    anthropicApiKey: settings.llmAnthropicApiKey,
    anthropicModel: settings.llmAnthropicModel,
    timeout: settings.llmTimeout,
  };
}

/**
 * LLM client for Define/Rewrite/Review commands.
 * Wraps the shared multi-provider LLM client.
 */
export class LLMClient {
  private client: SharedLLMClient;
  private settings: SpaceCommandSettings;

  constructor(settings: SpaceCommandSettings) {
    this.settings = settings;
    this.client = new SharedLLMClient(toProviderSettings(settings));
  }

  updateSettings(settings: SpaceCommandSettings): void {
    this.settings = settings;
    this.client.updateSettings(toProviderSettings(settings));
  }

  async define(text: string): Promise<LLMResponse> {
    const response = await this.client.request({
      prompt: `${this.settings.llmPrompt}\n\n"${text}"`,
    });

    if (response.success) {
      return { success: true, definition: response.content };
    }
    return { success: false, error: response.error };
  }

  async rewrite(text: string): Promise<LLMResponse> {
    const response = await this.client.request({
      prompt: `${this.settings.llmRewritePrompt}\n\n${text}`,
    });

    if (response.success) {
      return { success: true, result: response.content };
    }
    return { success: false, error: response.error };
  }

  async review(text: string): Promise<LLMResponse> {
    const response = await this.client.request({
      prompt: `${this.settings.llmReviewPrompt}\n\n${text}`,
    });

    if (response.success) {
      return { success: true, result: response.content };
    }
    return { success: false, error: response.error };
  }

  getModel(): string {
    return this.client.getModel();
  }

  getProvider(): string {
    return this.client.getProvider();
  }
}
