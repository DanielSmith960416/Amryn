/**
 * Just enough ZIP to open a spreadsheet.
 *
 * An .xlsx file is a ZIP archive of XML documents. Reading one therefore needs
 * a ZIP reader, and the decision here is the same one csv.ts made and for the
 * same reasons: this is a well-specified format, the application only ever
 * *reads* archives it was handed, and Node already carries the hard part —
 * `zlib.inflateRawSync` is the DEFLATE decoder, which is the only piece that
 * would be unreasonable to write.
 *
 * What is left is the container: find the index, read the entries, hand back
 * the bytes. That is this file.
 *
 * ── what it deliberately does not do ──────────────────────────────────────
 *
 * No writing, no encryption, no ZIP64, no multi-disk archives. A spreadsheet
 * that needs any of those is either not a spreadsheet or is larger than the
 * upload limit lets through, and a reader that pretends to handle cases it has
 * never seen is worse than one that says it cannot.
 */
import { inflateRawSync } from 'node:zlib';

/** The four-byte marks the format is built around. */
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

/**
 * The entries of an archive, by name.
 *
 * Names are the paths as the archive stores them — 'xl/workbook.xml' — with
 * forward slashes, which is what the specification requires and what every
 * spreadsheet program emits.
 */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = findCentralDirectory(bytes, view);

  const entries = new Map<string, Uint8Array>();
  let offset = directory.offset;

  for (let index = 0; index < directory.count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_FILE_HEADER) {
      throw new ArchiveError('That file is damaged — its index does not match its contents.');
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);

    const name = text(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    // Directories are entries too, and hold nothing.
    if (name.endsWith('/')) continue;

    entries.set(name, read(bytes, view, localOffset, method, compressedSize, name));
  }

  return entries;
}

/**
 * Where the index is.
 *
 * At the end, behind a comment of up to 65,535 bytes, so it is found by
 * scanning backwards for its signature rather than by arithmetic. Scanning
 * from the end also means a file with a ZIP archive appended to something else
 * reads as the archive, which is how self-extracting files work and costs
 * nothing to support.
 */
function findCentralDirectory(
  bytes: Uint8Array,
  view: DataView,
): { offset: number; count: number } {
  const earliest = Math.max(0, bytes.length - 0xffff - 22);

  for (let at = bytes.length - 22; at >= earliest; at -= 1) {
    if (view.getUint32(at, true) !== END_OF_CENTRAL_DIRECTORY) continue;

    const count = view.getUint16(at + 10, true);
    const offset = view.getUint32(at + 16, true);

    // 0xffff / 0xffffffff are ZIP64's "look elsewhere" markers, which this
    // reader does not follow. Saying so beats reading from offset 4294967295.
    if (count === 0xffff || offset === 0xffffffff) {
      throw new ArchiveError('That file uses a ZIP variant we cannot read. Save it again as .xlsx.');
    }
    if (offset + 46 > bytes.length) {
      throw new ArchiveError('That file is damaged — its index points past the end of it.');
    }

    return { offset, count };
  }

  throw new ArchiveError('That is not a spreadsheet we can open — it is not a valid .xlsx file.');
}

/** One entry's bytes, from its local header onwards. */
function read(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
  name: string,
): Uint8Array {
  if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER) {
    throw new ArchiveError('That file is damaged — one of its parts is not where the index says.');
  }

  // The local header repeats the name and extra-field lengths, and they are
  // allowed to differ from the central directory's. The data starts after
  // whatever *this* header says, so these are read here rather than reused.
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;

  if (end > bytes.length) {
    throw new ArchiveError('That file is truncated — it ends part-way through its contents.');
  }

  const slice = bytes.subarray(start, end);

  if (method === STORED) return slice;
  if (method !== DEFLATED) {
    throw new ArchiveError(`That file uses a compression we cannot read (${name}). Save it again as .xlsx.`);
  }

  try {
    return new Uint8Array(inflateRawSync(slice));
  } catch {
    // An encrypted archive fails here, as does a corrupt one, and the two are
    // not distinguishable from the outside. Neither is worth a second sentence.
    throw new ArchiveError('We could not decompress that file. If it is password-protected, remove the password and try again.');
  }
}

function text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
