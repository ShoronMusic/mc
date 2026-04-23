import 'server-only';

import { Storage } from '@google-cloud/storage';

type GcsObjectRef = {
  bucket: string;
  objectPath: string;
};

let storageClient: Storage | null = null;
let warnedGcsAuthFailure = false;

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

function readServiceAccountFromEnv(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      ...(parsed.project_id ? { project_id: parsed.project_id } : {}),
    };
  } catch {
    return null;
  }
}

function getStorageClient(): Storage {
  if (storageClient) return storageClient;
  const envCredentials = readServiceAccountFromEnv();
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || envCredentials?.project_id?.trim() || undefined;
  storageClient = new Storage({
    ...(projectId ? { projectId } : {}),
    ...(envCredentials
      ? {
          credentials: {
            client_email: envCredentials.client_email,
            private_key: envCredentials.private_key,
          },
        }
      : {}),
  });
  return storageClient;
}

function parseGcsUrl(url: string): GcsObjectRef | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'storage.googleapis.com') return null;
    const pathname = parsed.pathname.replace(/^\/+/, '');
    if (!pathname) return null;
    const slash = pathname.indexOf('/');
    if (slash <= 0) return null;
    const bucket = pathname.slice(0, slash).trim();
    const objectPath = decodeURIComponent(pathname.slice(slash + 1)).trim();
    if (!bucket || !objectPath) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

export async function fetchJsonWithOptionalGcsAuth<T>(url: string): Promise<T | null> {
  const gcs = parseGcsUrl(url);
  if (gcs) {
    try {
      const [buffer] = await getStorageClient().bucket(gcs.bucket).file(gcs.objectPath).download();
      return JSON.parse(buffer.toString('utf-8')) as T;
    } catch (error) {
      if (!warnedGcsAuthFailure) {
        warnedGcsAuthFailure = true;
        console.warn(
          '[music8-gcs] authenticated fetch failed. Configure Google credentials (ADC/service account).',
          error,
        );
      }
      return null;
    }
  }

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function checkUrlExistsWithOptionalGcsAuth(url: string): Promise<boolean> {
  const gcs = parseGcsUrl(url);
  if (gcs) {
    try {
      const [exists] = await getStorageClient().bucket(gcs.bucket).file(gcs.objectPath).exists();
      return exists;
    } catch (error) {
      if (!warnedGcsAuthFailure) {
        warnedGcsAuthFailure = true;
        console.warn(
          '[music8-gcs] authenticated exists check failed. Configure Google credentials (ADC/service account).',
          error,
        );
      }
      return false;
    }
  }

  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return true;
  } catch {}
  try {
    const get = await fetch(url, { cache: 'no-store' });
    return get.ok;
  } catch {
    return false;
  }
}
