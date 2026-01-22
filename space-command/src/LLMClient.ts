import { requestUrl } from "obsidian";

export interface LLMConfig {
  url: string;
  model: string;
  prompt: string;
  rewritePrompt: string;
  reviewPrompt: string;
  timeout: number;
}

export interface LLMResponse {
  success: boolean;
  definition?: string;
  result?: string;
  error?: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async define(text: string): Promise<LLMResponse> {
    const fullPrompt = `${this.config.prompt}\n\n"${text}"`;

    try {
      const response = await requestUrl({
        url: `${this.config.url}/api/generate`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: fullPrompt,
          stream: false,
        }),
        throw: false,
      });

      if (response.status !== 200) {
        console.error(`[Space Command] Define request failed`, {
          status: response.status,
          model: this.config.model,
          url: this.config.url,
          response: response.text,
        });
        return {
          success: false,
          error: "request_failed",
        };
      }

      const data = response.json;
      return {
        success: true,
        definition: data.response?.trim() || "No response received",
      };
    } catch (error) {
      console.error(`[Space Command] Define request error`, {
        model: this.config.model,
        url: this.config.url,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: "connection_failed",
      };
    }
  }

  async rewrite(text: string): Promise<LLMResponse> {
    const fullPrompt = `${this.config.rewritePrompt}\n\n${text}`;

    try {
      const response = await requestUrl({
        url: `${this.config.url}/api/generate`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: fullPrompt,
          stream: false,
        }),
        throw: false,
      });

      if (response.status !== 200) {
        console.error(`[Space Command] Rewrite request failed`, {
          status: response.status,
          model: this.config.model,
          url: this.config.url,
          response: response.text,
        });
        return {
          success: false,
          error: "request_failed",
        };
      }

      const data = response.json;
      return {
        success: true,
        result: data.response?.trim() || "No response received",
      };
    } catch (error) {
      console.error(`[Space Command] Rewrite request error`, {
        model: this.config.model,
        url: this.config.url,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: "connection_failed",
      };
    }
  }

  async review(text: string): Promise<LLMResponse> {
    const fullPrompt = `${this.config.reviewPrompt}\n\n${text}`;

    try {
      const response = await requestUrl({
        url: `${this.config.url}/api/generate`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: fullPrompt,
          stream: false,
        }),
        throw: false,
      });

      if (response.status !== 200) {
        console.error(`[Space Command] Review request failed`, {
          status: response.status,
          model: this.config.model,
          url: this.config.url,
          response: response.text,
        });
        return {
          success: false,
          error: "request_failed",
        };
      }

      const data = response.json;
      return {
        success: true,
        result: data.response?.trim() || "No response received",
      };
    } catch (error) {
      console.error(`[Space Command] Review request error`, {
        model: this.config.model,
        url: this.config.url,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: "connection_failed",
      };
    }
  }

  getModel(): string {
    return this.config.model;
  }
}
