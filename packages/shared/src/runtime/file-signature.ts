import { stripAccents } from "../domain/text.ts";
import type { AttachmentType } from "../schemas/support.ts";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Detects the real file type from its first bytes ("magic numbers"), so a renamed
 * executable cannot be uploaded as an image. Returns null for anything not allowed.
 */
export function detectAttachmentType(bytes: Uint8Array): AttachmentType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }
  return null;
}

/** Keeps letters, numbers, dots, dashes and underscores; never returns an empty name. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = stripAccents(base)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "arquivo";
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Larger images are refused: a few MB of PNG can declare 30.000 × 30.000 pixels, about 3,6 GB
 * once decoded, and freeze the browser of whoever opens it (the support team, for attachments).
 * 64 megapixels fits any phone photo; 16.384 px per side is what browsers draw.
 */
export const MAX_IMAGE_PIXELS = 64_000_000;
export const MAX_IMAGE_SIDE = 16_384;

function uint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number {
  return uint16BigEndian(bytes, offset) * 65_536 + uint16BigEndian(bytes, offset + 2);
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

/** JPEG start-of-frame markers, which carry the image size (not DHT C4, JPG C8, DAC CC). */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSize(bytes: Uint8Array): ImageSize | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1] ?? 0;
    // Any number of 0xFF fill bytes may come before a marker.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_FRAME_MARKERS.has(marker)) {
      return {
        height: uint16BigEndian(bytes, offset + 5),
        width: uint16BigEndian(bytes, offset + 7),
      };
    }
    const segmentLength = uint16BigEndian(bytes, offset + 2);
    if (segmentLength < 2) {
      return null;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  if (startsWith(bytes, [0x56, 0x50, 0x38, 0x20], 12) && bytes.length >= 30) {
    // VP8 (lossy): 14-bit sizes after the frame tag.
    return {
      width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff,
      height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff,
    };
  }
  if (startsWith(bytes, [0x56, 0x50, 0x38, 0x4c], 12) && bytes.length >= 25) {
    // VP8L (lossless): two 14-bit fields, minus one.
    const b1 = bytes[22] ?? 0;
    return {
      width: 1 + ((((b1 & 0x3f) << 8) | (bytes[21] ?? 0)) >>> 0),
      height:
        1 + ((((bytes[24] ?? 0) & 0x0f) << 10) | ((bytes[23] ?? 0) << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (startsWith(bytes, [0x56, 0x50, 0x38, 0x58], 12) && bytes.length >= 30) {
    // VP8X (extended): 24-bit canvas sizes, minus one.
    return { width: 1 + uint24LittleEndian(bytes, 24), height: 1 + uint24LittleEndian(bytes, 27) };
  }
  return null;
}

/**
 * Width and height an image declares in its header, read without decoding it; null when the
 * header cannot be read (refuse those: the size is unknown).
 */
export function imageSize(bytes: Uint8Array, type: AttachmentType): ImageSize | null {
  if (type === "image/png") {
    return bytes.length >= 24
      ? { width: uint32BigEndian(bytes, 16), height: uint32BigEndian(bytes, 20) }
      : null;
  }
  if (type === "image/jpeg") {
    return jpegSize(bytes);
  }
  if (type === "image/webp") {
    return webpSize(bytes);
  }
  return null;
}

/** The image's size is readable, not zero, and within the limits above. */
export function hasAcceptableImageSize(bytes: Uint8Array, type: AttachmentType): boolean {
  const size = imageSize(bytes, type);
  if (!size || size.width === 0 || size.height === 0) {
    return false;
  }
  return (
    size.width <= MAX_IMAGE_SIDE &&
    size.height <= MAX_IMAGE_SIDE &&
    size.width * size.height <= MAX_IMAGE_PIXELS
  );
}
