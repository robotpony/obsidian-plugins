/**
 * Supported LLM providers.
 */
export type LLMProvider = "ollama" | "openai" | "gemini" | "anthropic";

/**
 * Provider-specific configuration.
 */
export interface LLMProviderSettings {
  provider: LLMProvider;
  // Ollama settings
  ollamaEndpoint: string;
  ollamaModel: string;
  // OpenAI settings
  openaiApiKey: string;
  openaiModel: string;
  // Gemini settings
  geminiApiKey: string;
  geminiModel: string;
  // Anthropic settings
  anthropicApiKey: string;
  anthropicModel: string;
  // Request timeout in ms
  timeout: number;
}

/**
 * Default provider settings.
 */
export const DEFAULT_LLM_PROVIDER_SETTINGS: LLMProviderSettings = {
  provider: "ollama",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  anthropicApiKey: "",
  anthropicModel: "claude-3-haiku-20240307",
  timeout: 30000,
};

/**
 * Message format for multi-turn conversations.
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Request options for LLM calls.
 */
export interface LLMRequestOptions {
  /** System prompt (instructions, context) */
  system?: string;
  /** User message (the actual query) */
  prompt: string;
  /** Request JSON response format */
  jsonResponse?: boolean;
}

/**
 * Response from LLM call.
 */
export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
}
