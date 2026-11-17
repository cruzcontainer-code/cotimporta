import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getEnv, requireEnv } from "@/lib/env";
import { AppError } from "@/server/errors";
import { assertKey } from "./key";
import { s3Provider } from "./s3";

// Archivos privados. Claves: users/<userId>/quotes/<quoteId>/{uploads,images,generated}/…
// Nunca se sirven directo: los route handlers leen bytes tras requireActor + propiedad.

export interface StorageProvider {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** Borra todo lo que empieza con `prefix`; devuelve cuántos archivos borró. */
  deletePrefix(prefix: string): Promise<number>;
  /** Claves bajo `prefix`, ordenadas. */
  list(prefix: string): Promise<string[]>;
}

function localProvider(root: string): StorageProvider {
  const base = resolve(root);
  const pathOf = (key: string) => {
    assertKey(key);
    const full = resolve(base, ...key.split("/"));
    const inside = relative(base, full);
    if (inside.startsWith("..") || isAbsolute(inside)) {
      throw new AppError("VALIDATION", "Clave de almacenamiento inválida");
    }
    return full;
  };

  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(full)));
      else if (entry.isFile()) files.push(full);
    }
    return files;
  }
  const toKey = (full: string) => relative(base, full).split(sep).join("/");

  return {
    async put(key, bytes) {
      const full = pathOf(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathOf(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
    async deletePrefix(prefix) {
      const keys = await this.list(prefix);
      await Promise.all(keys.map((key) => rm(pathOf(key), { force: true })));
      return keys.length;
    },
    async list(prefix) {
      const trimmed = prefix.replace(/\/+$/, "");
      if (trimmed) assertKey(trimmed);
      const all = (await walk(base)).map(toKey);
      return all.filter((key) => key === trimmed || key.startsWith(`${trimmed}/`)).sort();
    },
  };
}

let instance: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!instance) {
    const driver = getEnv().STORAGE_DRIVER ?? "local";
    switch (driver) {
      case "local":
        instance = localProvider(requireEnv("STORAGE_LOCAL_DIR"));
        break;
      case "s3":
        instance = s3Provider({
          bucket: requireEnv("S3_BUCKET"),
          region: getEnv().S3_REGION ?? "auto",
          endpoint: getEnv().S3_ENDPOINT,
          accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
          forcePathStyle: getEnv().S3_FORCE_PATH_STYLE === "true",
        });
        break;
    }
  }
  return instance;
}

export const storageKeys = {
  quotePrefix: (userId: string, quoteId: string) => `users/${userId}/quotes/${quoteId}`,
  upload: (userId: string, quoteId: string, id: string) =>
    `users/${userId}/quotes/${quoteId}/uploads/${id}.pdf`,
  image: (userId: string, quoteId: string, id: string) =>
    `users/${userId}/quotes/${quoteId}/images/${id}.png`,
  generated: (userId: string, quoteId: string, name: string) =>
    `users/${userId}/quotes/${quoteId}/generated/${name}`,
};
