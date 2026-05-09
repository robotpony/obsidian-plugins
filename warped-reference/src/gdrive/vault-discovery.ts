import { readFile } from "fs/promises";
import { join, basename } from "path";
import { homedir, platform } from "os";

export interface VaultInfo {
  name: string;
  path: string;
  open: boolean;
}

interface ObsidianRegistry {
  vaults: Record<string, { path: string; ts?: number; open?: boolean }>;
}

/** Return the platform-specific path to Obsidian's registry file. */
export function registryPath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "obsidian", "obsidian.json");
    case "linux":
      return join(home, ".config", "obsidian", "obsidian.json");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "obsidian", "obsidian.json");
    default:
      // Best guess for unknown platforms
      return join(home, ".config", "obsidian", "obsidian.json");
  }
}

/**
 * Discover all Obsidian vaults registered on this machine.
 * Derives vault names from the last path segment, appending a suffix for duplicates.
 */
export async function discoverVaults(customRegistryPath?: string): Promise<VaultInfo[]> {
  const regPath = customRegistryPath ?? registryPath();
  let raw: string;
  try {
    raw = await readFile(regPath, "utf-8");
  } catch {
    return [];
  }

  let registry: ObsidianRegistry;
  try {
    registry = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!registry.vaults || typeof registry.vaults !== "object") {
    return [];
  }

  const vaults: VaultInfo[] = [];
  const nameCounts = new Map<string, number>();

  for (const [, entry] of Object.entries(registry.vaults)) {
    if (!entry.path) continue;

    let name = basename(entry.path);
    const count = nameCounts.get(name) ?? 0;
    nameCounts.set(name, count + 1);
    if (count > 0) {
      name = `${name}-${count}`;
    }

    vaults.push({
      name,
      path: entry.path,
      open: entry.open ?? false,
    });
  }

  return vaults;
}
