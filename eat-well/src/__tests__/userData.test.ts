/**
 * Tests for UserDataService — merge logic and user-wins-on-conflict.
 * Uses a temp directory so no real plugin directory is needed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { UserDataService } from "../UserDataService";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eat-well-test-"));
}

function removeDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeUserData(pluginDir: string, filename: string, data: unknown) {
  const dir = path.join(pluginDir, "user-data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data), "utf-8");
}

describe("UserDataService — aliases", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { removeDir(tmpDir); });

  it("loads bundled aliases", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    expect(svc.aliases["msg"]).toBe("monosodium glutamate");
    expect(svc.aliases["evoo"]).toBe("olive oil");
  });

  it("user alias overrides bundled", () => {
    writeUserData(tmpDir, "aliases.json", { evoo: "extra virgin olive oil" });
    const svc = new UserDataService(tmpDir);
    svc.load();
    expect(svc.aliases["evoo"]).toBe("extra virgin olive oil");
  });

  it("user alias added via addAlias is persisted", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    svc.addAlias("EVOO", "extra virgin olive oil");
    const svc2 = new UserDataService(tmpDir);
    svc2.load();
    expect(svc2.aliases["evoo"]).toBe("extra virgin olive oil");
  });

  it("missing user file returns bundled only", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    // Should not throw; bundled aliases present
    expect(Object.keys(svc.aliases).length).toBeGreaterThan(0);
  });
});

describe("UserDataService — food weights", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { removeDir(tmpDir); });

  it("loads bundled food weights", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    const shallot = svc.foodWeights.find(e => e.key === "shallot" && e.unit === "each");
    expect(shallot).not.toBeUndefined();
    expect(shallot!.grams).toBe(30);
  });

  it("user entry prepended — wins in first-match lookup", () => {
    writeUserData(tmpDir, "food_weights.json", [
      { key: "shallot", unit: "each", grams: 99 }
    ]);
    const svc = new UserDataService(tmpDir);
    svc.load();
    // User entries are prepended, so the first shallot+each entry is the user one
    const first = svc.foodWeights.find(e => e.key === "shallot" && e.unit === "each");
    expect(first!.grams).toBe(99);
  });

  it("addFoodWeight persists and reloads", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    svc.addFoodWeight("truffle", "each", 25);
    const svc2 = new UserDataService(tmpDir);
    svc2.load();
    const entry = svc2.foodWeights.find(e => e.key === "truffle" && e.unit === "each");
    expect(entry!.grams).toBe(25);
  });

  it("addFoodWeight updates existing entry", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    svc.addFoodWeight("truffle", "each", 25);
    svc.addFoodWeight("truffle", "each", 30);
    const svc2 = new UserDataService(tmpDir);
    svc2.load();
    const entries = svc2.foodWeights.filter(e => e.key === "truffle" && e.unit === "each");
    // Should only have one user entry
    const userEntries = entries.filter(e => e.grams === 30);
    expect(userEntries.length).toBe(1);
  });
});

describe("UserDataService — taste defaults", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { removeDir(tmpDir); });

  it("loads bundled taste defaults", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    const salt = svc.tasteDefaults.find(t => t.key === "salt");
    expect(salt!.grams).toBe(2.0);
  });

  it("user override prepended — wins in first-match", () => {
    writeUserData(tmpDir, "taste_defaults.json", [{ key: "salt", grams: 5 }]);
    const svc = new UserDataService(tmpDir);
    svc.load();
    const first = svc.tasteDefaults.find(t => t.key === "salt");
    expect(first!.grams).toBe(5);
  });

  it("addTasteDefault persists", () => {
    const svc = new UserDataService(tmpDir);
    svc.load();
    svc.addTasteDefault("miso", 8);
    const svc2 = new UserDataService(tmpDir);
    svc2.load();
    expect(svc2.tasteDefaults.find(t => t.key === "miso")!.grams).toBe(8);
  });
});
