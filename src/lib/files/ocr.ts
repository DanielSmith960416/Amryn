/**
 * Reading a page that is a picture of a page.
 *
 * A scanned invoice has no text layer, so migration 38's extraction returns
 * nothing and says so. This is what closes that gap, and it runs on Amryn's
 * own worker: Tesseract and poppler, both in the container, nothing per page
 * and nothing leaving our infrastructure.
 *
 * ── shelling out, which this codebase already does ───────────────────────
 *
 * backup.mjs shells to pg_dump and restore-check.mjs to psql, for the reason
 * that applies here too: these are mature programs that do one thing, and the
 * npm wrappers around them are a layer of translation between our arguments
 * and theirs that can only add ways to be wrong. tesseract.js exists and
 * bundles its own WebAssembly build of the same engine — slower, larger, and
 * a second copy of Tesseract to keep current.
 *
 * ── what it is honest about ──────────────────────────────────────────────
 *
 * Recognition is a reading, not a transcript, and it is wrong often enough to
 * matter. Measured on an invoice rendered two ways, the same engine dropped a
 * quantity of 140 in one pass and turned R42.50 into "RA250" in the other.
 * Both outputs looked equally confident, and neither announced its error.
 *
 * Two consequences run through this file. Tesseract's own per-word confidence
 * is kept and returned, so a page it half-read can be shown as such. And
 * nothing here writes a number anywhere: the output is text a person can
 * search and must check, and `text_source = 'ocr'` is what carries that
 * caveat to every page that displays it.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class OcrError extends Error {
  /** Whether trying the same file again could reasonably work. */
  readonly retryable: boolean;

  constructor(message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'OcrError';
    this.retryable = options.retryable ?? false;
  }
}

export interface OcrPage {
  number: number;
  text: string;
  /**
   * Tesseract's mean word confidence, 0-100, or null where it reported none.
   *
   * Not a probability that the page is right. It is the engine's own opinion
   * of its own reading, which is worth having precisely because it is
   * sometimes low on a page whose text looks plausible.
   */
  confidence: number | null;
}

export interface OcrResult {
  pages: OcrPage[];
  text: string;
  /** The mean across pages that reported one. */
  confidence: number | null;
  /** Pages beyond the cap, which were not read. */
  skipped: number;
}

/**
 * How many pages one document may cost us.
 *
 * At roughly a third of a second a page this is about half a minute of worker
 * time, which is a reasonable amount to spend on one upload and a poor amount
 * to spend on a hundred. Beyond it the pages are counted and skipped, and the
 * interface says how many — silently reading the first fifty of a two hundred
 * page bundle would be the worst of both.
 */
export const MAX_OCR_PAGES = 100;

/** 150 dpi: enough for Tesseract, and a quarter the pixels of 300. */
const RASTER_DPI = 150;

/** Per page. A page that takes this long is a page something is wrong with. */
const PAGE_TIMEOUT_MS = 30_000;

/**
 * Whether the container can do this at all.
 *
 * Checked rather than assumed, and reported rather than thrown: a worker
 * missing its binaries should say which one in a job result somebody can
 * read, not fail every scan with a spawn error.
 */
export async function ocrAvailable(): Promise<{ ready: boolean; missing: string[] }> {
  const missing: string[] = [];

  for (const [binary, argument] of [
    ['tesseract', '--version'],
    ['pdftoppm', '-v'],
  ] as const) {
    try {
      await run(binary, [argument], { timeout: 10_000 });
    } catch {
      missing.push(binary);
    }
  }

  return { ready: missing.length === 0, missing };
}

/**
 * The words on a scanned PDF, page by page.
 *
 * @param bytes the PDF itself.
 * @param onProgress called after each page, so a long job can renew its lease.
 */
export async function readScannedPdf(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => Promise<void> | void,
): Promise<OcrResult> {
  const available = await ocrAvailable();
  if (!available.ready) {
    // Retryable: the binary is missing from this container, and the next
    // deployment may well have it. A permanent failure here would need a
    // person to notice and re-queue every scan uploaded in between.
    throw new OcrError(
      `This worker cannot read scans — ${available.missing.join(' and ')} ${available.missing.length === 1 ? 'is' : 'are'} not installed.`,
      { retryable: true },
    );
  }

  const workspace = await mkdtemp(join(tmpdir(), 'amryn-ocr-'));

  try {
    await rasterise(bytes, workspace);

    const images = (await readdir(workspace))
      .filter((name) => name.startsWith('page-') && name.endsWith('.png'))
      // '-10.png' sorts before '-2.png' as text, which would silently reorder
      // the document. By the number in the name, as the slide reader does.
      .sort((a, b) => pageNumber(a) - pageNumber(b));

    if (images.length === 0) {
      throw new OcrError('That PDF produced no pages to read.', { retryable: false });
    }

    const wanted = images.slice(0, MAX_OCR_PAGES);
    const pages: OcrPage[] = [];

    for (const [index, image] of wanted.entries()) {
      pages.push({ number: index + 1, ...(await recognise(join(workspace, image))) });
      await onProgress?.(index + 1, wanted.length);
    }

    const scored = pages.filter((page) => page.confidence !== null);

    return {
      pages,
      text: pages
        .filter((page) => page.text !== '')
        .map((page) => (pages.length > 1 ? `[Page ${page.number}]\n${page.text}` : page.text))
        .join('\n\n'),
      confidence:
        scored.length === 0
          ? null
          : Math.round(scored.reduce((sum, page) => sum + (page.confidence ?? 0), 0) / scored.length),
      skipped: images.length - wanted.length,
    };
  } finally {
    // Whatever happened. A temporary directory left behind after a failure is
    // the one that fills the disk on the tenth retry.
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

/** PDF to one PNG per page. */
async function rasterise(bytes: Uint8Array, workspace: string): Promise<void> {
  try {
    const child = execFile(
      'pdftoppm',
      ['-png', '-r', String(RASTER_DPI), '-', join(workspace, 'page')],
      { timeout: PAGE_TIMEOUT_MS * 4, maxBuffer: 1024 * 1024 },
    );

    // Down stdin rather than via a temporary file: the bytes are already in
    // memory and writing them out only to read them back is a copy of a
    // customer's document onto a disk for no reason.
    child.stdin?.end(Buffer.from(bytes));
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`pdftoppm exited ${code}`)),
      );
    });
  } catch {
    // pdftoppm's own message names a file path in a temporary directory and
    // helps nobody who did not write this. The remedy is the same whichever
    // way it failed: the file is kept and can be opened.
    throw new OcrError(
      'We could not turn that PDF into pages to read. It may be damaged or password-protected.',
      { retryable: false },
    );
  }
}

/**
 * One image, read once.
 *
 * ── this was two invocations, and two was wrong twice over ───────────────
 *
 * The first version ran Tesseract for the text and again for the per-word
 * confidences, in parallel. Both processes died — no output, no signal, empty
 * stderr — because two copies of the engine over one A4 page at 150 dpi want
 * more memory than a modest container has, and they were competing for the
 * same cores to do it.
 *
 * Running them in sequence would have fixed the crash and kept the waste. The
 * TSV already contains the words: reconstructing the text from it is one pass
 * instead of two, half the memory, and — the part worth more than the speed —
 * the text and the confidence are then guaranteed to describe the same
 * reading. Two passes could disagree, and the one that disagreed would be the
 * one nobody checked.
 */
async function recognise(image: string): Promise<{ text: string; confidence: number | null }> {
  const { stdout } = await run('tesseract', [image, 'stdout', '-l', 'eng', 'tsv'], {
    timeout: PAGE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });

  return { text: tidy(textFromTsv(stdout)), confidence: meanConfidence(stdout) };
}

/**
 * Tesseract's TSV, back into lines of text.
 *
 * Every row carries the page, block, paragraph and line it belongs to, so the
 * words regroup exactly as the engine saw them. Grouping by all four rather
 * than by the line number alone is not pedantry: line numbers restart within
 * each block, so two columns of a table both have a line 1 and joining on that
 * alone interleaves them into a sentence that appears in no document.
 */
export function textFromTsv(tsv: string): string {
  const lines = new Map<string, string[]>();

  for (const row of tsv.split('\n').slice(1)) {
    const columns = row.split('\t');
    if (columns.length < 12) continue;

    const word = (columns[11] ?? '').trim();
    if (word === '') continue;

    const key = columns.slice(1, 5).join(':');
    const existing = lines.get(key);
    if (existing) existing.push(word);
    else lines.set(key, [word]);
  }

  // Insertion order is reading order — Tesseract emits rows top to bottom,
  // and a Map keeps that. Sorting the keys as strings would put line 10 before
  // line 2.
  return [...lines.values()].map((words) => words.join(' ')).join('\n');
}

/**
 * The mean word confidence out of the same TSV.
 *
 * Column 11 is the confidence and column 12 the word. Rows describing page,
 * block, paragraph and line structure carry -1 and no word; counting those
 * would drag every page toward the same meaningless number.
 *
 * Not a probability that the page is right — it is the engine's opinion of its
 * own reading, which is worth having precisely because it is sometimes low on
 * a page whose text looks perfectly plausible.
 */
export function meanConfidence(tsv: string): number | null {
  const scores: number[] = [];

  for (const line of tsv.split('\n').slice(1)) {
    const columns = line.split('\t');
    if (columns.length < 12) continue;

    const confidence = Number(columns[10]);
    const word = (columns[11] ?? '').trim();
    if (word === '' || !Number.isFinite(confidence) || confidence < 0) continue;
    scores.push(confidence);
  }

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function pageNumber(name: string): number {
  return Number(/page-0*(\d+)\.png$/.exec(name)?.[1] ?? 0);
}

/**
 * Recognition leaves the same artefacts extraction does, plus one of its own.
 *
 * A page of pure noise — a photograph of a wall, a blank sheet — comes back as
 * scattered single characters rather than as nothing. Lines with no letters in
 * them are dropped, which is the difference between "we could not read this"
 * and a page of punctuation presented as a document's contents.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .filter((line) => line === '' || /[A-Za-z0-9]/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
