import sharp from "sharp";
import { createFile, MP4BoxBuffer, type ES_Descriptor } from "mp4box";

export const customImageLimit = 4 * 1024 * 1024;
export const customVideoLimit = 4_000_000;
export const customRequestLimit = customImageLimit + 64 * 1024;
export type CustomMediaMetadata = { mimeType: "image/webp" | "video/mp4"; bytes: number; width: number; height: number; durationSeconds?: number };
export class CustomMediaError extends Error {
  constructor(message: string, readonly status = 400, readonly reconciliation?: { storageKey: string; providerAuthority: string }) { super(message); }
}
function invalid(): never { throw new CustomMediaError("Malformed or unsupported media."); }
type AvcConfiguration = { configurationVersion: number; lengthSizeMinusOne: number; SPS: { length?: number; data: Uint8Array }[]; PPS: { length?: number; data: Uint8Array }[] };

// Validate complete RIFF framing before decoding pixels. Metadata/animation
// chunks are deliberately outside this web-derivative upload contract.
async function validateWebp(buffer: Buffer): Promise<CustomMediaMetadata> {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP" || buffer.readUInt32LE(4) + 8 !== buffer.length) invalid();
  let offset = 12, images = 0, chunks = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length || ++chunks > 4) invalid();
    const type = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    if (!["VP8X", "ALPH", "VP8 ", "VP8L"].includes(type) || !size || offset + 8 + size + (size % 2) > buffer.length) invalid();
    if (type === "VP8 " || type === "VP8L") images++;
    if (size % 2 && buffer[offset + 8 + size] !== 0) invalid();
    offset += 8 + size + (size % 2);
  }
  if (images !== 1) invalid();
  try {
    const image = sharp(buffer, { failOn: "warning", limitInputPixels: 4_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== "webp" || !metadata.width || !metadata.height || metadata.width > 2000 || metadata.height > 2000 || (metadata.pages ?? 1) !== 1) invalid();
    // metadata alone does not decode compressed pixel data.
    await image.stats();
    return { mimeType: "image/webp", bytes: buffer.length, width: metadata.width!, height: metadata.height! };
  } catch { return invalid(); }
}

type BoxRange = { type: string; start: number; end: number; payload: number };
// Read bounded AVC SPS dimensions instead of trusting a forgeable sample-entry
// width/height. Prepared derivatives use 8-bit YUV420 baseline/main/high AVC.
function avcSequenceDimensions(nalu: Uint8Array) {
  const rbsp: number[] = [];
  for (let i = 1; i < nalu.length; i++) {
    if (i >= 3 && nalu[i] === 3 && nalu[i - 1] === 0 && nalu[i - 2] === 0) { if (i + 1 >= nalu.length || nalu[i + 1] > 3) invalid(); continue; }
    rbsp.push(nalu[i]);
  }
  let cursor = 0;
  const bits = (count: number) => { if (count < 0 || count > 32 || cursor + count > rbsp.length * 8) invalid(); let value = 0; while (count--) { value = value * 2 + ((rbsp[cursor >> 3] >> (7 - (cursor & 7))) & 1); cursor++; } return value; };
  const ue = () => { let zeroes = 0; while (bits(1) === 0) if (++zeroes > 24) invalid(); return 2 ** zeroes - 1 + bits(zeroes); };
  const se = () => { const value = ue(); return value & 1 ? (value + 1) / 2 : -value / 2; };
  const profile = bits(8); bits(8); bits(8);
  if (![66, 77, 88, 100].includes(profile) || ue() > 31) invalid();
  if (profile === 100) {
    if (ue() !== 1 || ue() !== 0 || ue() !== 0) invalid();
    bits(1);
    if (bits(1)) for (let list = 0; list < 8; list++) if (bits(1)) {
      let last = 8, next = 8;
      for (let n = 0; n < (list < 6 ? 16 : 64); n++) { if (next) next = (last + se() + 256) % 256; if (next) last = next; }
    }
  }
  if (ue() > 12) invalid();
  const order = ue();
  if (order === 0) { if (ue() > 12) invalid(); }
  else if (order === 1) { bits(1); se(); se(); const count = ue(); if (count > 255) invalid(); for (let n = 0; n < count; n++) se(); }
  else if (order !== 2) invalid();
  if (ue() > 16) invalid(); bits(1);
  const widthBlocks = ue() + 1, heightBlocks = ue() + 1, frameOnly = bits(1);
  if (widthBlocks > 240 || heightBlocks * (2 - frameOnly) > 240) invalid();
  if (!frameOnly) bits(1); bits(1);
  let width = widthBlocks * 16, height = heightBlocks * 16 * (2 - frameOnly);
  if (bits(1)) { width -= (ue() + ue()) * 2; height -= (ue() + ue()) * 2 * (2 - frameOnly); }
  if (width < 1 || height < 1 || width > 3840 || height > 3840) invalid();
  return { width, height };
}
// Check framing and table sizes BEFORE MP4Box constructs sample arrays. This
// accepts prepared, unfragmented AVC/AAC MP4 only, never arbitrary containers.
function mp4Ranges(buffer: Buffer) {
  const media: BoxRange[] = [], top: BoxRange[] = [];
  let boxes = 0;
  const containers = new Set(["moov", "trak", "edts", "mdia", "minf", "dinf", "stbl", "udta", "ilst", "\xa9too"]);
  const leaves = new Set(["ftyp", "mvhd", "tkhd", "elst", "mdhd", "hdlr", "vmhd", "smhd", "url ", "avcC", "pasp", "btrt", "colr", "esds", "stts", "ctts", "stss", "stsc", "stsz", "stco", "co64", "sdtp", "sgpd", "sbgp", "data"]);
  const tableWidths: Record<string, number> = { stts: 8, ctts: 8, stss: 4, stsc: 12, stco: 4, co64: 8 };
  function walk(start: number, end: number, depth: number) {
    if (depth > 12) invalid();
    let offset = start;
    while (offset < end) {
      if (offset + 8 > end || ++boxes > 512) invalid();
      const size = buffer.readUInt32BE(offset), type = buffer.toString("latin1", offset + 4, offset + 8);
      if (size < 8 || offset + size > end) invalid(); // no zero/extended/fragmented boxes
      const box = { type, start: offset, end: offset + size, payload: offset + 8 };
      const p = box.payload, length = size - 8;
      if (depth === 0) {
        if (!["ftyp", "moov", "mdat", "free"].includes(type)) invalid();
        top.push(box);
      }
      if (type === "mdat") { if (depth !== 0 || length === 0) invalid(); media.push(box); }
      else if (type === "free") { if (buffer.subarray(p, box.end).some(byte => byte !== 0)) invalid(); }
      else if (containers.has(type)) walk(p, box.end, depth + 1);
      else if (type === "meta") { if (length < 4 || buffer.readUInt32BE(p) !== 0) invalid(); walk(p + 4, box.end, depth + 1); }
      else if (type === "stsd" || type === "dref") {
        if (length < 8 || buffer.readUInt32BE(p) !== 0 || buffer.readUInt32BE(p + 4) !== 1) invalid();
        walk(p + 8, box.end, depth + 1);
      } else if (type === "avc1" || type === "mp4a") {
        const header = type === "avc1" ? 78 : 28;
        if (length < header) invalid();
        walk(p + header, box.end, depth + 1);
      } else if (!leaves.has(type)) invalid();
      if (tableWidths[type]) {
        if (length < 8) invalid();
        const count = buffer.readUInt32BE(p + 4);
        if (count > 100_000 || length !== 8 + count * tableWidths[type]) invalid();
        if (type === "stsc") for (let i = 0; i < count; i++) if (!buffer.readUInt32BE(p + 12 + i * 12) || buffer.readUInt32BE(p + 12 + i * 12) > 100_000) invalid();
      }
      if (type === "stsz") {
        if (length < 12) invalid();
        const count = buffer.readUInt32BE(p + 8), fixed = buffer.readUInt32BE(p + 4);
        if (count > 100_000 || length !== 12 + (fixed ? 0 : count * 4)) invalid();
      }
      if (type === "elst") {
        if (length < 8 || buffer[p] > 1 || buffer.readUInt32BE(p + 4) > 10 || length !== 8 + buffer.readUInt32BE(p + 4) * (buffer[p] ? 20 : 12)) invalid();
      }
      if (type === "url " && (length !== 4 || buffer.readUInt32BE(p) !== 1)) invalid(); // no external data references
      if (type === "colr" && !((length === 11 && buffer.toString("ascii", p, p + 4) === "nclx") || (length === 10 && buffer.toString("ascii", p, p + 4) === "nclc"))) invalid(); // no opaque ICC/profile payload
      if (type === "sgpd") {
        if (length < 16 || buffer.readUInt32BE(p) !== 0x01000000 || buffer.toString("ascii", p + 4, p + 8) !== "roll" || buffer.readUInt32BE(p + 8) !== 2 || buffer.readUInt32BE(p + 12) > 128 || length !== 16 + buffer.readUInt32BE(p + 12) * 2) invalid();
      }
      if (type === "sbgp") {
        if (length < 12 || buffer.readUInt32BE(p) !== 0 || buffer.toString("ascii", p + 4, p + 8) !== "roll" || buffer.readUInt32BE(p + 8) > 1024 || length !== 12 + buffer.readUInt32BE(p + 8) * 8) invalid();
        for (let n = 0; n < buffer.readUInt32BE(p + 8); n++) if (buffer.readUInt32BE(p + 12 + n * 8) > 100_000 || buffer.readUInt32BE(p + 16 + n * 8) > 128) invalid();
      }
      offset = box.end;
    }
  }
  walk(0, buffer.length, 0);
  if (top[0]?.type !== "ftyp" || top.filter(b => b.type === "ftyp").length !== 1 || top.filter(b => b.type === "moov").length !== 1 || media.length !== 1 || top[0].end < 20) invalid();
  if (!["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(buffer.toString("ascii", 8, 12))) invalid();
  return media;
}

function validateMp4(buffer: Buffer, maxDurationSeconds: number): CustomMediaMetadata {
  try {
    const media = mp4Ranges(buffer), file = createFile();
    let failed = false;
    file.onError = () => { failed = true; };
    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), 0));
    file.flush();
    const info = file.getInfo();
    if (failed || info.isFragmented || info.videoTracks.length !== 1 || info.tracks.length > 2 || info.tracks.some(t => t.type !== "video" && t.type !== "audio")) invalid();
    const video = info.videoTracks[0], width = video.video?.width, height = video.video?.height;
    const durationSeconds = Math.max(info.duration / info.timescale, ...info.tracks.map(t => t.duration / t.timescale));
    if (!width || !height || width > 3840 || height > 3840 || !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > Math.min(60, maxDurationSeconds)) invalid();
    const trackSamples = info.tracks.map(track => ({ track, samples: file.getTrackSamplesInfo(track.id) }));
    // Reject shared/overlapping or unaccounted media bytes BEFORE scanning any
    // codec payload. The encoded-byte limit therefore also bounds validation work.
    const ranges = trackSamples.flatMap(({ samples }) => samples.map(s => ({ offset: s.offset, size: s.size }))).sort((a, b) => a.offset - b.offset);
    let cursor = media[0].payload;
    for (const range of ranges) {
      if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.size) || range.size < 1 || range.offset !== cursor || range.size > media[0].end - cursor) invalid();
      cursor += range.size;
    }
    if (cursor !== media[0].end) invalid();
    for (const { track, samples } of trackSamples) {
      if (!(track.codec.startsWith("avc1.") || track.codec.startsWith("mp4a.40.")) || track.nb_samples < 1 || track.nb_samples > 100_000) invalid();
      if (samples.length !== track.nb_samples || samples.some(s => !Number.isSafeInteger(s.duration) || s.duration < 1)) invalid();
      const validatedDescriptions = new Set<object>();
      for (const sample of samples) {
        const description = sample.description as unknown as { avcC?: AvcConfiguration; esds?: { esd?: ES_Descriptor } };
        if (track.type === "video") {
          const config = description.avcC;
          if (!config || config.configurationVersion !== 1 || ![0, 1, 3].includes(config.lengthSizeMinusOne) || !config.SPS.length || !config.PPS.length) invalid();
          if (!validatedDescriptions.has(description)) {
            for (const [sets, type] of [[config.SPS, 7], [config.PPS, 8]] as const) for (const set of sets) {
              if (!set.length || set.length < (type === 7 ? 4 : 2) || set.data.length !== set.length || (set.data[0] & 0x80) || (set.data[0] & 31) !== type) invalid();
              if (type === 7) { const dimensions = avcSequenceDimensions(set.data); if (dimensions.width !== width || dimensions.height !== height) invalid(); }
            }
            validatedDescriptions.add(description);
          }
          const prefix = config.lengthSizeMinusOne + 1, end = sample.offset + sample.size;
          let offset = sample.offset, nalCount = 0, slices = 0;
          while (offset < end) {
            if (offset + prefix > end || ++nalCount > 4096) invalid();
            const length = buffer.readUIntBE(offset, prefix); offset += prefix;
            if (length < 2 || offset + length > end || (buffer[offset] & 0x80)) invalid();
            const type = buffer[offset] & 31;
            if (![1, 5, 6, 7, 8, 9, 12].includes(type)) invalid();
            if (type === 7) { const dimensions = avcSequenceDimensions(buffer.subarray(offset, offset + length)); if (dimensions.width !== width || dimensions.height !== height) invalid(); }
            if (type === 1 || type === 5) slices++;
            offset += length;
          }
          if (!slices) invalid();
        } else {
          // MP4 carries raw AAC access units (no ADTS sync header). Require
          // supported AAC-LC decoder configuration and nonempty sample framing.
          if (track.codec !== "mp4a.40.2" || !description.esds?.esd || description.esds.esd.getAudioConfig() !== 2 || description.esds.esd.URL) invalid();
          const specific = description.esds.esd.findDescriptor(4)?.findDescriptor(5)?.data as Uint8Array | undefined;
          if (!specific || specific.length < 2 || (specific[0] >> 3) !== 2 || ((specific[0] & 7) << 1 | specific[1] >> 7) > 12 || ![1, 2].includes((specific[1] >> 3) & 15)) invalid();
          if (sample.size < 2 || !buffer.subarray(sample.offset, sample.offset + sample.size).some(byte => byte !== 0)) invalid();
        }
      }
    }
    return { mimeType: "video/mp4", bytes: buffer.length, width: width!, height: height!, durationSeconds };
  } catch { return invalid(); }
}

export async function validateCustomMedia(buffer: Buffer, mimeType: string, maxDurationSeconds: number): Promise<CustomMediaMetadata> {
  if (!["image/webp", "video/mp4"].includes(mimeType)) throw new CustomMediaError("Use a prepared WebP image or MP4 video.", 415);
  if (!buffer.length || buffer.length > (mimeType === "image/webp" ? customImageLimit : customVideoLimit)) throw new CustomMediaError("Media exceeds the upload limit.", 413);
  return mimeType === "image/webp" ? validateWebp(buffer) : validateMp4(buffer, maxDurationSeconds);
}

export async function boundedCustomMediaForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new CustomMediaError("Multipart upload required.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CustomMediaError("Missing upload.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > customRequestLimit) { await reader.cancel(); throw new CustomMediaError("Request too large.", 413); }
    chunks.push(value);
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new CustomMediaError("Malformed upload."); }
}

export function customMediaFilename(name: string, mimeType: CustomMediaMetadata["mimeType"]) {
  return `${name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "media"}.${mimeType === "image/webp" ? "webp" : "mp4"}`;
}
