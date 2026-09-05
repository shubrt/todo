import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ConnectionStore, type SecretStorage } from "../src/main/connection-store";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Geräteverbindung im Schlüsselbund", () => {
  async function temporary() {
    const directory = await mkdtemp(join(tmpdir(), "todo-desktop-test-"));
    directories.push(directory);
    return join(directory, "connection.enc");
  }

  it("schreibt ausschließlich verschlüsselte Bytes und entfernt sie beim Trennen", async () => {
    const path = await temporary();
    const secret = JSON.stringify({ siteUrl: "https://test.convex.site", apiKey: "test-secret" });
    const storage: SecretStorage = {
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: vi.fn(async () => Buffer.from([0, 192, 56, 20])),
      decryptStringAsync: async () => ({ result: secret, shouldReEncrypt: false }),
    };
    const store = new ConnectionStore(path, storage);
    expect(await store.read()).toBeNull();
    await store.write(secret);
    expect(await readFile(path)).toEqual(Buffer.from([0, 192, 56, 20]));
    expect((await readFile(path, "utf8")).includes("test-secret")).toBe(false);
    expect(await store.read()).toBe(secret);
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it("legt ohne sicheren Schlüsselspeicher keinen Klartext-Fallback an", async () => {
    const path = await temporary();
    const encrypt = vi.fn(async () => Buffer.alloc(0));
    const store = new ConnectionStore(path, {
      isAsyncEncryptionAvailable: async () => false,
      encryptStringAsync: encrypt,
      decryptStringAsync: async () => ({ result: "", shouldReEncrypt: false }),
    });
    await expect(store.write("never persist me")).rejects.toThrow("Schlüsselbund");
    expect(encrypt).not.toHaveBeenCalled();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
