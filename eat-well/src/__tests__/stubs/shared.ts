// Stub of the shared module for unit tests.
export const createNoticeFactory = () => () => {};
export class SidebarManager {
  constructor(_app: unknown, _viewType: string) {}
  activate() {}
  toggle() {}
  refresh() {}
}
export class LLMClient {}
export const ok = <T>(data: T) => ({ ok: true as const, data });
export const err = <E>(code: E, message?: string) => ({ ok: false as const, code, message });
export const isOk = (r: { ok: boolean }) => r.ok;
export const isErr = (r: { ok: boolean }) => !r.ok;
