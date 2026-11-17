import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageProvider } from "./index";
import { assertKey } from "./key";

export type S3Config = {
  bucket: string;
  region: string;
  /** Vacío para AWS S3; para Cloudflare R2: https://<cuenta>.r2.cloudflarestorage.com */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

/**
 * Bucket privado compatible con S3 (AWS S3, Cloudflare R2, MinIO). Nada es público: la app lee
 * los bytes y los sirve tras requireActor + propiedad, igual que con el driver local.
 */
export function s3Provider(config: S3Config): StorageProvider {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;

  async function list(prefix: string): Promise<string[]> {
    const trimmed = prefix.replace(/\/+$/, "");
    if (trimmed) assertKey(trimmed);
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket, Prefix: trimmed, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        const key = item.Key;
        if (key && (key === trimmed || key.startsWith(`${trimmed}/`) || !trimmed)) keys.push(key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }

  return {
    async put(key, bytes, contentType) {
      assertKey(key);
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }),
      );
    },
    async get(key) {
      assertKey(key);
      try {
        const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      assertKey(key);
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async deletePrefix(prefix) {
      const keys = await list(prefix);
      // DeleteObjects acepta hasta 1000 claves por llamada.
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
      return keys.length;
    },
    list,
  };
}
