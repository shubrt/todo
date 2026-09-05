import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SecretStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export class ConnectionStore {
  constructor(
    private readonly path: string,
    private readonly storage: SecretStorage,
  ) {}

  async read(): Promise<string | null> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.path);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Die gespeicherte Verbindung konnte nicht gelesen werden.");
    }
    if (!(await this.storage.isAsyncEncryptionAvailable()))
      throw new Error("Entsperre deinen macOS-Schlüsselbund, um die Verbindung zu laden.");
    const decrypted = await this.storage.decryptStringAsync(encrypted);
    if (decrypted.shouldReEncrypt) await this.write(decrypted.result);
    return decrypted.result;
  }

  async write(value: string): Promise<void> {
    if (!(await this.storage.isAsyncEncryptionAvailable()))
      throw new Error(
        "Der macOS-Schlüsselbund ist nicht verfügbar. Die Verbindung wurde nicht gespeichert.",
      );
    const encrypted = await this.storage.encryptStringAsync(value);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(`${this.path}.tmp`, encrypted, { mode: 0o600 });
    await rename(`${this.path}.tmp`, this.path);
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
