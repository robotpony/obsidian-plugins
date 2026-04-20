// Minimal stub of the Obsidian API for unit tests.
export class TFile {}
export class App {}
export class MarkdownView {}
export const moment = () => ({ format: () => "" });
export class Vault {}
export class WorkspaceLeaf {}
export class Events {
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
    return this;
  }
  off(event: string, handler: (...args: unknown[]) => void) {
    this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler);
  }
  trigger(event: string, ...args: unknown[]) {
    (this.handlers[event] || []).forEach(h => h(...args));
  }
}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {
  constructor(_msg: string, _timeout?: number) {}
}
export class Modal {
  constructor(_app: App) {}
  open() {}
  close() {}
}
export class ItemView {
  containerEl: { children: HTMLElement[] } = { children: [{} as HTMLElement, createMockEl()] };
  app: App = new App();
  constructor(_leaf: WorkspaceLeaf) {}
}
export function setIcon(_el: HTMLElement, _icon: string): void {}
export class Menu {
  addItem(cb: (item: { setTitle: (t: string) => typeof item; setIcon: (i: string) => typeof item; onClick: (fn: () => void) => typeof item }) => void) {
    const item = { setTitle: () => item, setIcon: () => item, onClick: () => item };
    cb(item);
    return this;
  }
  addSeparator() { return this; }
  showAtMouseEvent(_e: MouseEvent) {}
}

// Minimal DOM mock for tests that render into HTMLElement
function createMockEl(): HTMLElement {
  const el: Partial<HTMLElement> & {
    empty(): void;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: { cls?: string; text?: string; attr?: Record<string, string> }
    ): HTMLElement;
    addClass(cls: string): void;
  } = {
    empty() { this.innerHTML = ""; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEl(_tag: string, opts?: any): any {
      const child = createMockEl() as HTMLElement;
      if (opts?.text) child.textContent = opts.text;
      if (opts?.cls) child.className = opts.cls;
      return child;
    },
    addClass(_cls: string) {},
    innerHTML: "",
    textContent: "",
    className: "",
    addEventListener: () => {},
    children: [] as unknown as HTMLCollectionOf<Element>,
  };
  return el as HTMLElement;
}

export { createMockEl };
