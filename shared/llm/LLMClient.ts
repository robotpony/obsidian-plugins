import { requestUrl } from "obsidian";
import { LLMProviderSettings, LLMRequestOptions, LLMResponse } from "./types";

/**
 * Multi-provider LLM client.
 * Supports Ollama (local), OpenAI, Gemini, and Anthropic.
 */
export class LLMClient {
  private settings: LLMProviderSettings;

  constructor(settings: LLMProviderSettings) {
    this.settings = settings;
  }

  updateSettings(settings: LLMProviderSettings): void {
    this.settings = settings;
  }

  getProvider(): string {
    return this.settings.provider;
  }

  getModel(): string {
    switch (this.settings.provider) {
      case "ollama":
        return this.settings.ollamaModel;
      case "openai":
        return this.settings.openaiModel;
      case "gemini":
        return this.settings.geminiModel;
      case "anthropic":
        return this.settings.anthropicModel;
    }
  }

  /**
   * Send a request to the LLM and get a response.
   */
  async request(options: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const content = await this.callProvider(options);
      return { success: true, content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LLM] Request failed (${this.settings.provider}):`, message);
      return { success: false, error: message };
    }
  }

  private async callProvider(options: LLMRequestOptions): Promise<string> {
    switch (this.settings.provider) {
      case "ollama":
        return this.callOllama(options);
      case "openai":
        return this.callOpenAI(options);
      case "gemini":
        return this.callGemini(options);
      case "anthropic":
        return this.callAnthropic(options);
      default:
        throw new Error(`Unknown provider: ${this.settings.provider}`);
    }
  }

  private async callOllama(options: LLMRequestOptions): Promise<string> {
    // Ollama uses a single prompt, so combine system and user
    const fullPrompt = options.system
      ? `${options.system}\n\n${options.prompt}`
      : options.prompt;

    const response = await requestUrl({
      url: `${this.settings.ollamaEndpoint}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.settings.ollamaModel,
        prompt: fullPrompt,
        stream: false,
        ...(options.jsonResponse ? { format: "json" } : {}),
      }),
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`Ollama error: ${response.status} - ${response.text}`);
    }

    return response.json.response?.trim() || "";
  }

  private async callOpenAI(options: LLMRequestOptions): Promise<string> {
    if (!this.settings.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: options.prompt });

    const response = await requestUrl({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.openaiModel,
        messages,
        ...(options.jsonResponse ? { response_format: { type: "json_object" } } : {}),
      }),
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI error: ${response.status} - ${response.text}`);
    }

    return response.json.choices[0].message.content?.trim() || "";
  }

  private async callGemini(options: LLMRequestOptions): Promise<string> {
    if (!this.settings.geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.geminiModel}:generateContent?key=${this.settings.geminiApiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
        contents: [{ parts: [{ text: options.prompt }] }],
        generationConfig: options.jsonResponse
          ? { responseMimeType: "application/json" }
          : {},
      }),
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`Gemini error: ${response.status} - ${response.text}`);
    }

    return response.json.candidates[0].content.parts[0].text?.trim() || "";
  }

  private async callAnthropic(options: LLMRequestOptions): Promise<string> {
    if (!this.settings.anthropicApiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const response = await requestUrl({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.settings.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.settings.anthropicModel,
        max_tokens: 4096,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: options.prompt }],
      }),
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`Anthropic error: ${response.status} - ${response.text}`);
    }

    return response.json.content[0].text?.trim() || "";
  }
}
