import { requestUrl } from "obsidian";
import { ReviewSettings, OutlineSettings } from "./types";

/**
 * LLM client for enhancing document outlines.
 * Reuses LLM provider settings from ReviewSettings.
 */
export class OutlineLLMClient {
  private reviewSettings: ReviewSettings;
  private outlineSettings: OutlineSettings;

  constructor(reviewSettings: ReviewSettings, outlineSettings: OutlineSettings) {
    this.reviewSettings = reviewSettings;
    this.outlineSettings = outlineSettings;
  }

  updateSettings(reviewSettings: ReviewSettings, outlineSettings: OutlineSettings): void {
    this.reviewSettings = reviewSettings;
    this.outlineSettings = outlineSettings;
  }

  /**
   * Enhance a document outline with questions and suggestions.
   * Returns the modified markdown content.
   */
  async enhance(content: string, styleGuide: string): Promise<string> {
    const prompt = this.buildPrompt(content, styleGuide);

    try {
      const response = await this.callLLM(prompt);
      return this.extractMarkdown(response);
    } catch (error) {
      console.error("[Hugo Outline] LLM call failed:", error);
      throw error;
    }
  }

  private buildPrompt(content: string, styleGuide: string): string {
    let styleSection = "";
    if (styleGuide.trim()) {
      styleSection = `
## Style Guidelines

${styleGuide}

`;
    }

    const hasStyleGuide = styleGuide.trim().length > 0;
    const styleInstructions = hasStyleGuide
      ? `When the content doesn't follow a style guide rule, cite the specific rule in your comment (e.g., "<!-- Style: 'Avoid corporate jargon' - consider replacing 'leverage' with 'use' -->").`
      : "";

    return `${this.outlineSettings.prompt}
${styleSection}
## Document to Enhance

${content}

## Instructions

Return the enhanced document as markdown. Keep all original content intact.
Add your questions and suggestions as HTML comments (<!-- Q: question here --> for questions, <!-- suggestion here --> for suggestions).
${styleInstructions}
Return ONLY the enhanced markdown, no explanations or preamble.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    switch (this.reviewSettings.provider) {
      case "ollama":
        return this.callOllama(prompt);
      case "openai":
        return this.callOpenAI(prompt);
      case "gemini":
        return this.callGemini(prompt);
      case "anthropic":
        return this.callAnthropic(prompt);
      default:
        throw new Error(`Unknown provider: ${this.reviewSettings.provider}`);
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const response = await requestUrl({
      url: `${this.reviewSettings.ollamaEndpoint}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.reviewSettings.ollamaModel,
        prompt,
        stream: false,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return response.json.response;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.reviewSettings.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await requestUrl({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.reviewSettings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.reviewSettings.openaiModel,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    return response.json.choices[0].message.content;
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.reviewSettings.geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.reviewSettings.geminiModel}:generateContent?key=${this.reviewSettings.geminiApiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Gemini error: ${response.status}`);
    }

    return response.json.candidates[0].content.parts[0].text;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    if (!this.reviewSettings.anthropicApiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const response = await requestUrl({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.reviewSettings.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.reviewSettings.anthropicModel,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Anthropic error: ${response.status}`);
    }

    return response.json.content[0].text;
  }

  /**
   * Extract markdown from the response, handling code blocks if present.
   */
  private extractMarkdown(response: string): string {
    let content = response.trim();

    // Remove markdown code blocks if the LLM wrapped the response
    const codeBlockMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }

    return content;
  }
}
