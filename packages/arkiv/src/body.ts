import { hexToBytes, type Hex } from "viem";

/** All bytes() values in one create share a single 128 KiB budget (Arkiv guides/quickstart). */
export const MAX_BODY_BYTES = 128 * 1024;

/** Entity `body` columns are JSON as UTF-8 bytes. Confidential content never goes in here: only pointers and labels. */
export function encodeBody(value: unknown): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > MAX_BODY_BYTES) throw new Error(`entity body is ${bytes.length} bytes, over the 128 KiB limit`);
  return bytes;
}

export function decodeBody<T = unknown>(body: Uint8Array | Hex): T {
  const bytes = typeof body === "string" ? hexToBytes(body) : body;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error("entity body is not valid JSON");
  }
}
