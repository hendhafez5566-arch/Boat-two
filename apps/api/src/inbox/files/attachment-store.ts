import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { constants } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { isStoredName } from './storage';

export interface AttachmentStore {
  put(name: string, bytes: Buffer, mime: string): Promise<void>;
  get(name: string): Promise<Buffer>;
  has(name: string): Promise<boolean>;
  removeOrphan(name: string): Promise<void>;
}
export class AttachmentMissing extends Error {}
const MAX = 10 * 1024 * 1024;
function valid(name: string) { if (!isStoredName(name)) throw new Error('Invalid storage key'); }
function unavailable(): never { throw new ServiceUnavailableException('Attachment storage temporarily unavailable'); }

export class FilesystemAttachmentStore implements AttachmentStore {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async put(name: string, bytes: Buffer) {
    valid(name); if (bytes.length > MAX) throw new Error('Attachment too large');
    await mkdir(this.root, { recursive: true });
    const file = await open(join(this.root, name), 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  }
  async get(name: string) {
    valid(name);
    let file;
    try {
      file = await open(join(this.root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX) return unavailable();
      return await file.readFile();
    } catch (error: any) { if (error.code === 'ENOENT') throw new AttachmentMissing(); return unavailable(); }
    finally { await file?.close(); }
  }
  async has(name: string) { try { await this.get(name); return true; } catch (e) { if (e instanceof AttachmentMissing) return false; throw e; } }
  async removeOrphan(name: string) { valid(name); await unlink(join(this.root, name)).catch((e) => { if (e.code !== 'ENOENT') throw e; }); }
}

export type ObjectStoreSettings = { endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; prefix?: string; allowHttp?: boolean };
export class S3AttachmentStore implements AttachmentStore {
  private readonly client: S3Client;
  constructor(private readonly settings: ObjectStoreSettings) {
    const u = new URL(settings.endpoint);
    if ((u.protocol !== 'https:' && !(settings.allowHttp && u.protocol === 'http:')) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Invalid S3 endpoint');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(settings.bucket) || !/^(?:[a-zA-Z0-9_-]+\/)*$/.test(settings.prefix || '')) throw new Error('Invalid S3 bucket/prefix');
    this.client = new S3Client({ endpoint: u.origin, region: settings.region, forcePathStyle: true, credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey }, maxAttempts: 2, requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 } });
  }
  private input(name: string) { valid(name); return { Bucket: this.settings.bucket, Key: (this.settings.prefix || '') + name }; }
  private missing(e: any) { return e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey'; }
  async put(name: string, bytes: Buffer, mime: string) {
    if (bytes.length > MAX) throw new Error('Attachment too large');
    try { await this.client.send(new PutObjectCommand({ ...this.input(name), Body: bytes, ContentType: mime, IfNoneMatch: '*' })); } catch { unavailable(); }
  }
  async get(name: string) {
    try {
      const result = await this.client.send(new GetObjectCommand(this.input(name)));
      if (!result.Body || (result.ContentLength ?? MAX + 1) > MAX) { (result.Body as any)?.destroy?.(); return unavailable(); }
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > MAX) { (result.Body as any).destroy?.(); return unavailable(); }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (e) { if (this.missing(e)) throw new AttachmentMissing(); return unavailable(); }
  }
  async has(name: string) { try { await this.client.send(new HeadObjectCommand(this.input(name))); return true; } catch (e) { if (this.missing(e)) return false; return unavailable(); } }
  async removeOrphan(name: string) { try { await this.client.send(new DeleteObjectCommand(this.input(name))); } catch { unavailable(); } }
}

/** Private byte transport only. Tenant and lifecycle authorization always remains in FilesController/DB. */
@Injectable()
export class AttachmentStorage implements AttachmentStore {
  private readonly driver: AttachmentStore;
  constructor() {
    this.driver = env.ATTACHMENT_STORAGE === 's3' ? new S3AttachmentStore({ endpoint: env.S3_ENDPOINT!, region: env.S3_REGION, bucket: env.S3_BUCKET!, accessKey: env.S3_ACCESS_KEY_ID!, secretKey: env.S3_SECRET_ACCESS_KEY!, prefix: env.S3_PREFIX, allowHttp: env.S3_ALLOW_HTTP === 'true' }) : new FilesystemAttachmentStore(env.UPLOAD_DIR);
  }
  put(name: string, bytes: Buffer, mime: string) { return this.driver.put(name, bytes, mime); }
  get(name: string) { return this.driver.get(name); }
  has(name: string) { return this.driver.has(name); }
  removeOrphan(name: string) { return this.driver.removeOrphan(name); }
}
