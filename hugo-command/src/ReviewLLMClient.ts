import { requestUrl } from "obsidian";
import { LLMProvider, ReviewCriterion, ReviewSettings } from "./types";

/**
 * LLM client for running content reviews.
 * Supports Ollama (default), OpenAI, Gemini, and Anthropic.
 */
export class ReviewLLMClient {
  private settings: ReviewSettings;

  constructor(settings: ReviewSettings) {
    this.settings = settings;
  }

  updateSettings(settings: ReviewSettings): void {
    this.settings = settings;
  }

  /**
   * Run a review of the content against the criteria.
   * Returns structured results for each criterion.
   */
  async review(
    content: string,
    styleGuide: string
  ): Promise<ReviewCriterion[]> {
    const criteria = this.parseCriteria();
    if (criteria.length === 0) {
      return [];
    }

    const prompt = this.buildPrompt(content, styleGuide, criteria);

    try {
      const response = await this.callLLM(prompt);
      return this.parseResponse(response, criteria);
    } catch (error) {
      console.error("[Hugo Review] LLM call failed:", error);
      throw error;
    }
  }

  private parseCriteria(): string[] {
    return this.settings.criteria
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private buildPrompt(
    content: string,
    styleGuide: string,
    criteria: string[]
  ): string {
    const criteriaList = criteria
      .map((c, i) => `${i + 1}. ${c}`)
      .join("\n");

    let styleSection = "";
    if (styleGuide.trim()) {
      styleSection = `
## Style Guidelines

${styleGuide}

`;
    }

    return `You are a content reviewer. Review the following blog post against the checklist criteria.
${styleSection}
## Review Criteria

${criteriaList}

## Content to Review

${content}

## Instructions

For each criterion, determine if the content passes (true), fails (false), or is not applicable (null).
Provide a brief note explaining your assessment.

Respond with ONLY a JSON array in this exact format, with one object per criterion in order:
[
  {"passed": true, "note": "Brief explanation"},
  {"passed": false, "note": "Brief explanation"},
  ...
]

Do not include any other text, just the JSON array.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    switch (this.settings.provider) {
      case "ollama":
        return this.callOllama(prompt);
      case "openai":
        return this.callOpenAI(prompt);
      case "gemini":
        return this.callGemini(prompt);
      case "anthropic":
        return this.callAnthropic(prompt);
      default:
        throw new Error(`Unknown provider: ${this.settings.provider}`);
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const response = await requestUrl({
      url: `${this.settings.ollamaEndpoint}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.settings.ollamaModel,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return response.json.response;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.settings.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await requestUrl({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.openaiModel,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    return response.json.choices[0].message.content;
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.settings.geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.geminiModel}:generateContent?key=${this.settings.geminiApiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Gemini error: ${response.status}`);
    }

    return response.json.candidates[0].content.parts[0].text;
  }

  private async callAnthropic(prompt: string): Promise<string> {
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
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Anthropic error: ${response.status}`);
    }

    return response.json.content[0].text;
  }

  private parseResponse(
    response: string,
    criteria: string[]
  ): ReviewCriterion[] {
    try {
      // Try to extract JSON from the response
      let jsonStr = response.trim();

      // Handle case where response might be wrapped in markdown code blocks
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Try to find array in the response
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      const results = JSON.parse(jsonStr);

      if (!Array.isArray(results)) {
        throw new Error("Response is not an array");
      }

      return criteria.map((text, i) => {
        const result = results[i] || { passed: null, note: "No response" };
        return {
          text,
          passed: result.passed,
          note: result.note || "",
        };
      });
    } catch (error) {
      console.error("[Hugo Review] Failed to parse LLM response:", error);
      // Return criteria with null results on parse failure
      return criteria.map((text) => ({
        text,
        passed: null,
        note: "Failed to parse review response",
      }));
    }
  }
}
