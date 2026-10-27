export type JsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413 | 415; error: string };

export type TextBodyResult =
  | { ok: true; value: string }
  | { ok: false; status: 400 | 413; error: string };

export type UrlEncodedBodyResult =
  | { ok: true; value: URLSearchParams }
  | { ok: false; status: 400 | 413 | 415; error: string };

export async function readTextBody(
  request: Request,
  maximumBytes: number,
): Promise<TextBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes)
    return { ok: false, status: 413, error: "Request body is too large." };
  if (!request.body)
    return { ok: false, status: 400, error: "Request body is required." };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      return { ok: false, status: 413, error: "Request body is too large." };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

export async function readJsonBody<T>(
  request: Request,
  maximumBytes: number,
): Promise<JsonBodyResult<T>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json")
    return { ok: false, status: 415, error: "Content-Type must be application/json." };
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes)
    return { ok: false, status: 413, error: "Request body is too large." };
  const body = await readTextBody(request, maximumBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.value) as T };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body." };
  }
}

export async function readUrlEncodedBody(
  request: Request,
  maximumBytes: number,
): Promise<UrlEncodedBodyResult> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/x-www-form-urlencoded")
    return { ok: false, status: 415, error: "Invalid form submission." };
  const body = await readTextBody(request, maximumBytes);
  if (!body.ok) return body;
  return { ok: true, value: new URLSearchParams(body.value) };
}
