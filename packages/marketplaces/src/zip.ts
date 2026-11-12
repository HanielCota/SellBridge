import { inflateRawSync } from "node:zlib";

/** A ZIP file that could not be read: not a ZIP, damaged, or past the size allowed. */
export class InvalidZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidZipError";
  }
}

export interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_DIRECTORY_SIZE = 22;
/** The archive comment after the end record is at most 65,535 bytes. */
const MAX_COMMENT_BYTES = 0xffff;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const STORED = 0;
const DEFLATED = 8;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && view(bytes).getUint32(0, true) === LOCAL_HEADER_SIGNATURE;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function endOfDirectoryOffset(bytes: Uint8Array): number {
  const data = view(bytes);
  const lowest = Math.max(0, bytes.length - END_OF_DIRECTORY_SIZE - MAX_COMMENT_BYTES);
  for (let offset = bytes.length - END_OF_DIRECTORY_SIZE; offset >= lowest; offset -= 1) {
    if (data.getUint32(offset, true) === END_OF_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new InvalidZipError("ZIP end of central directory not found");
}

function entryData(bytes: Uint8Array, header: CentralHeader, maxBytes: number): Uint8Array {
  const data = view(bytes);
  if (data.getUint32(header.localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new InvalidZipError(`ZIP local header missing for entry ${header.name}`);
  }
  const nameLength = data.getUint16(header.localOffset + 26, true);
  const extraLength = data.getUint16(header.localOffset + 28, true);
  const start = header.localOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
  const compressed = bytes.subarray(start, start + header.compressedSize);
  if (compressed.length !== header.compressedSize) {
    throw new InvalidZipError(`ZIP entry ${header.name} is cut short`);
  }
  if (header.method === STORED) {
    return compressed;
  }
  if (header.method === DEFLATED) {
    try {
      return inflateRawSync(compressed, { maxOutputLength: maxBytes });
    } catch (error) {
      throw new InvalidZipError(
        `ZIP entry ${header.name} could not be inflated: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  throw new InvalidZipError(`ZIP entry ${header.name} uses method ${header.method}`);
}

interface CentralHeader {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  /** Where the next central header starts. */
  next: number;
}

function centralHeader(bytes: Uint8Array, offset: number): CentralHeader {
  const data = view(bytes);
  if (
    offset + CENTRAL_HEADER_SIZE > bytes.length ||
    data.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE
  ) {
    throw new InvalidZipError(`ZIP central header missing at ${offset}`);
  }
  const nameLength = data.getUint16(offset + 28, true);
  const extraLength = data.getUint16(offset + 30, true);
  const commentLength = data.getUint16(offset + 32, true);
  const nameStart = offset + CENTRAL_HEADER_SIZE;
  return {
    name: new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)),
    method: data.getUint16(offset + 10, true),
    compressedSize: data.getUint32(offset + 20, true),
    localOffset: data.getUint32(offset + 42, true),
    next: nameStart + nameLength + extraLength + commentLength,
  };
}

/**
 * The files of a ZIP archive, in the archive's order; folders are left out. Only stored and
 * deflated entries are read, and all of them together may hold at most `maxBytes`.
 *
 * @throws {InvalidZipError} When the bytes are not a readable ZIP or unpack past `maxBytes`.
 */
export function readZipEntries(bytes: Uint8Array, maxBytes: number): ZipEntry[] {
  const end = endOfDirectoryOffset(bytes);
  const data = view(bytes);
  const count = data.getUint16(end + 10, true);
  let offset = data.getUint32(end + 16, true);
  let total = 0;
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = centralHeader(bytes, offset);
    offset = header.next;
    if (header.name.endsWith("/")) {
      continue;
    }
    const content = entryData(bytes, header, maxBytes - total);
    total += content.length;
    if (total > maxBytes) {
      throw new InvalidZipError(`ZIP content is larger than ${maxBytes} bytes`);
    }
    entries.push({ name: header.name, data: Uint8Array.from(content) });
  }
  return entries;
}
