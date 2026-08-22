import { App, Modal, Setting } from "obsidian";

/**
 * Single-field prompt for "Send selection to project" — the title becomes
 * the `## <title> #todo` / `- [ ] <title> #todo` heading ProjectQueue.ts
 * writes into the project's TODO.md. Pre-filled with a suggested title
 * (the source note's name), editable before sending, Enter submits same
 * as clicking the button.
 */
export class SendToProjectModal extends Modal {
  private title: string;
  private onSubmit: (title: string) => void;

  constructor(app: App, suggestedTitle: string, onSubmit: (title: string) => void) {
    super(app);
    this.title = suggestedTitle;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("warped-todo-send-to-project-modal");
    contentEl.createEl("h2", { text: "Send selection to project" });

    let textEl: HTMLInputElement;
    new Setting(contentEl)
      .setName("Title")
      .setDesc("Becomes the heading for this item in the project's TODO.md.")
      .addText((text) => {
        textEl = text.inputEl;
        text.setValue(this.title).onChange((value) => {
          this.title = value;
        });
        text.inputEl.focus();
        text.inputEl.select();
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            this.submit();
          }
        });
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Send")
        .setCta()
        .onClick(() => this.submit())
    );
  }

  private submit(): void {
    const trimmed = this.title.trim();
    this.close();
    this.onSubmit(trimmed || "Untitled");
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
