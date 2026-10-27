import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Environment = Record<string, string | undefined>;
export type MediaAccess = "public" | "private";
export type R2MediaConfiguration = {
  accountId: string; endpoint: string; publicBucket: string; privateBucket: string;
  accessKeyId: string; secretAccessKey: string; publicOrigin: string;
};
const bucketName = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
export function r2MediaConfiguration(environment: Environment = process.env): R2MediaConfiguration {
  const accountId = environment.MEDIA_R2_ACCOUNT_ID?.trim() ?? "";
  const publicBucket = environment.MEDIA_R2_PUBLIC_BUCKET?.trim() ?? "";
  const privateBucket = environment.MEDIA_R2_PRIVATE_BUCKET?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/.test(accountId) || !bucketName.test(publicBucket) || !bucketName.test(privateBucket) || publicBucket === privateBucket || /backup|recovery/.test(publicBucket + privateBucket)) throw Error("Separate exact R2 media buckets required.");
  const endpoint = new URL(environment.MEDIA_R2_ENDPOINT?.trim() || `https://${accountId}.eu.r2.cloudflarestorage.com`);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.pathname !== "/" || endpoint.search || endpoint.hash || ![`${accountId}.r2.cloudflarestorage.com`, `${accountId}.eu.r2.cloudflarestorage.com`].includes(endpoint.hostname)) throw Error("Unsafe R2 media endpoint.");
  const accessKeyId = environment.MEDIA_R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = environment.MEDIA_R2_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!/^[a-fA-F0-9]{32}$/.test(accessKeyId) || secretAccessKey.length < 32 || /\s/.test(secretAccessKey)) throw Error("Dedicated R2 media credentials required.");
  const origin = new URL(environment.PUBLIC_APP_URL?.trim() ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw Error("Canonical HTTPS media origin required.");
  return { accountId, endpoint: endpoint.origin, publicBucket, privateBucket, accessKeyId, secretAccessKey, publicOrigin: origin.origin };
}

export function r2MediaAuthority(config: R2MediaConfiguration, access: MediaAccess) {
  return `r2-bucket:${config.accountId}:${access === "public" ? config.publicBucket : config.privateBucket}`;
}
export function validTenantMediaKey(siteId: string, key: string, access: MediaAccess) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(siteId) || key.length > 500 || /\.\.|[\\%?#\s]/.test(key) || !key.startsWith(`sites/${siteId}/`)) return false;
  const suffix = key.slice(`sites/${siteId}/`.length);
  if (access === "private" && !suffix.startsWith("editorial/")) return false;
  if (access === "public" && suffix.startsWith("editorial/")) return false;
  return /^(?:(?:custom|editorial)\/)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[A-Za-z0-9_-]{1,100}\.(?:webp|mp4)$/.test(suffix);
}
export function publicR2MediaUrl(config: R2MediaConfiguration, key: string) {
  void config;
  return `/api/media/r2/${key}`;
}
export function validMediaRange(value: string | null | undefined) {
  if (!value) return undefined;
  if (!/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(value)) throw Error("Invalid media range.");
  const [start, end] = value.slice(6).split("-");
  if ((start && end && Number(start) > Number(end)) || (!start && Number(end) === 0)) throw Error("Invalid media range.");
  return value;
}
type Sender = Pick<S3Client, "send">;
export class R2MediaStore {
  private readonly client: Sender;
  constructor(readonly configuration: R2MediaConfiguration, client?: Sender) {
    this.client = client ?? new S3Client({ region: "auto", endpoint: configuration.endpoint, forcePathStyle: true, credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  }
  private binding(siteId: string, key: string, access: MediaAccess, authority?: string) {
    if (!validTenantMediaKey(siteId, key, access) || (authority !== undefined && authority !== r2MediaAuthority(this.configuration, access))) throw Error("R2 tenant/object authority mismatch.");
    return { Bucket: access === "public" ? this.configuration.publicBucket : this.configuration.privateBucket, Key: key };
  }
  async put(input: { siteId: string; key: string; access: MediaAccess; mimeType: "image/webp" | "video/mp4"; bytes: Uint8Array }) {
    const binding = this.binding(input.siteId, input.key, input.access);
    const maximum = input.mimeType === "image/webp" ? 4_194_304 : 4_000_000;
    if (!input.bytes.byteLength || input.bytes.byteLength > maximum || (input.mimeType === "image/webp" ? !input.key.endsWith(".webp") : !input.key.endsWith(".mp4"))) throw Error("Invalid bounded R2 media payload.");
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const result = await this.client.send(new PutObjectCommand({ ...binding, Body: input.bytes, ContentType: input.mimeType, ContentLength: input.bytes.byteLength, IfNoneMatch: "*", CacheControl: input.access === "public" ? "public, max-age=31536000, immutable" : "private, no-store", Metadata: { "site-id": input.siteId, sha256, access: input.access } }), { abortSignal: AbortSignal.timeout(15_000) });
    if (!result.ETag) throw Error("R2 upload receipt missing.");
    return { provider: "r2" as const, pathname: input.key, authority: r2MediaAuthority(this.configuration, input.access), contentType: input.mimeType, etag: result.ETag, sha256, bytes: input.bytes.byteLength, url: input.access === "public" ? publicR2MediaUrl(this.configuration, input.key) : undefined };
  }
  async read(input: { siteId: string; key: string; access: MediaAccess; authority: string; mimeType: string; expectedBytes: number; range?: string | null; ifRange?: string | null; headOnly?: boolean }) {
    const binding = this.binding(input.siteId, input.key, input.access, input.authority);
    let range = input.headOnly ? undefined : validMediaRange(input.range);
    // Read metadata before opening the stream. Neither a path nor a bucket is
    // accepted as authority from a public request; callers first authorize DB state.
    const head = await this.client.send(new HeadObjectCommand(binding), { abortSignal: AbortSignal.timeout(8_000) });
    if (!/^"[A-Za-z0-9-]{1,128}"$/.test(head.ETag ?? "") || head.ContentType !== input.mimeType || head.ContentLength !== input.expectedBytes || head.Metadata?.["site-id"] !== input.siteId || head.Metadata?.access !== input.access || !/^[a-f0-9]{64}$/.test(head.Metadata?.sha256 ?? "")) throw Error("R2 registered metadata mismatch.");
    if (input.headOnly) return { stream: null, contentType: input.mimeType, bytes: head.ContentLength, contentRange: undefined, etag: head.ETag, sha256: head.Metadata!.sha256, status: 200 };
    if (input.ifRange && input.ifRange !== head.ETag) range = undefined;
    const result = await this.client.send(new GetObjectCommand({ ...binding, ...(range ? { Range: range } : {}), IfMatch: head.ETag }), { abortSignal: AbortSignal.timeout(15_000) });
    if (!result.Body || result.ContentType !== input.mimeType || result.ETag !== head.ETag || (range && !result.ContentRange)) throw Error("R2 media response mismatch.");
    if (range) {
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(result.ContentRange ?? "");
      if (!match || Number(match[3]) !== input.expectedBytes || Number(match[1]) > Number(match[2]) || Number(match[2]) >= input.expectedBytes || Number(match[2]) - Number(match[1]) + 1 !== result.ContentLength) throw Error("R2 range response mismatch.");
    } else if (result.ContentRange || result.ContentLength !== input.expectedBytes) throw Error("R2 full response mismatch.");
    return { stream: result.Body.transformToWebStream(), contentType: input.mimeType, bytes: result.ContentLength, contentRange: result.ContentRange, etag: result.ETag, sha256: head.Metadata!.sha256, status: range ? 206 : 200 };
  }
}
