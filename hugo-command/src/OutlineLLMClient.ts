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
    const systemPrompt = this.buildSystemPrompt(styleGuide);
    const userPrompt = this.buildUserPrompt(content);

    try {
      const response = await this.callLLM(systemPrompt, userPrompt);
      return this.extractMarkdown(response);
    } catch (error) {
      console.error("[Hugo Outline] LLM call failed:", error);
      throw error;
    }
  }

  private buildSystemPrompt(styleGuide: string): string {
    const hasStyleGuide = styleGuide.trim().length > 0;

    let styleSection = "";
    let styleInstructions = "";

    if (hasStyleGuide) {
      styleSection = `

## Style Guide Reference

Use this style guide when making suggestions. Cite specific rules when the content violates them.

${styleGuide}
`;
      styleInstructions = `
- When content violates a style rule, add a comment like: <!-- Style: 'rule name' - suggestion -->`;
    }

    return `You are a writing assistant that enhances document outlines by adding helpful questions and suggestions as HTML comments.

${this.outlineSettings.prompt}
${styleSection}
## Your Task

When given a document, return it with your annotations added as HTML comments:
- Questions: <!-- Q: your question here -->
- Suggestions: <!-- your suggestion here -->${styleInstructions}

## Critical Rules

1. Return ONLY the document with annotations - nothing else
2. Keep ALL original content exactly as provided
3. Do NOT include any preamble, explanation, or markdown code fences
4. Do NOT summarize or rewrite the content
5. Start your response directly with the document content`;
  }

  private buildUserPrompt(content: string): string {
    return `Enhance this document with your suggestions:

${content}`;
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    switch (this.reviewSettings.provider) {
      case "ollama":
        return this.callOllama(systemPrompt, userPrompt);
      case "openai":
        return this.callOpenAI(systemPrompt, userPrompt);
      case "gemini":
        return this.callGemini(systemPrompt, userPrompt);
      case "anthropic":
        return this.callAnthropic(systemPrompt, userPrompt);
      default:
        throw new Error(`Unknown provider: ${this.reviewSettings.provider}`);
    }
  }

  private async callOllama(systemPrompt: string, userPrompt: string): Promise<string> {
    // Ollama's generate endpoint doesn't support system messages well,
    // so we combine them but put the document last and clearly marked
    const combinedPrompt = `${systemPrompt}

---

${userPrompt}`;

    const response = await requestUrl({
      url: `${this.reviewSettings.ollamaEndpoint}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.reviewSettings.ollamaModel,
        prompt: combinedPrompt,
        stream: false,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return response.json.response;
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    return response.json.choices[0].message.content;
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.reviewSettings.geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    // Gemini uses systemInstruction for system prompts
    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.reviewSettings.geminiModel}:generateContent?key=${this.reviewSettings.geminiApiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Gemini error: ${response.status}`);
    }

    return response.json.candidates[0].content.parts[0].text;
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
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
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
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
