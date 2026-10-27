export const maximumImageBytes = 4 * 1024 * 1024;
export const maximumImageRequestBytes = maximumImageBytes + 256 * 1024;

export function safeWebpFilename(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .slice(0, 80);
  return `${base || "image"}.webp`;
}

export function webpDimensions(data: Buffer) {
  if (data.length < 30 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === "VP8L" && data[20] === 0x2f) return { width: 1 + data[21] + ((data[22] & 0x3f) << 8), height: 1 + (data[22] >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10) };
  if (chunk === "VP8 " && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  return null;
}
