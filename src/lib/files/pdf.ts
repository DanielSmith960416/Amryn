/**
 * Words out of a PDF.
 *
 * ── the one place a dependency was the right answer ──────────────────────
 *
 * csv.ts, xlsx.ts and office-text.ts are all written here rather than
 * installed, and the reasons were specific each time: a well-specified format,
 * a small surface, and the hard part already in Node. None of that holds for
 * PDF.
 *
 * A PDF does not contain text. It contains instructions for placing glyphs,
 * and turning those back into a sentence means resolving the cross-reference
 * table, decompressing object and content streams, tokenising the drawing
 * operators, and then — the part that defeats a home-made reader — mapping
 * each glyph code back to a character through the font's own encoding, which
 * for a subset font is an arbitrary table the file carries and for a CID font
 * is another indirection again. Getting that wrong does not fail loudly; it
 * produces confident nonsense. There is no honest way to write eight hundred
 * lines of that and claim to have tested it.
 *
 * So: unpdf, which packages Mozilla's pdf.js — the engine every browser's PDF
 * viewer is built on — for Node with no DOM. Chosen over pdfjs-dist itself
 * (34 MB unpacked against 2 MB, and this ships in a container image) and over
 * pdf-parse (which bundles an old pdf.js of its own).
 *
 * ── the case that must not read as "empty" ───────────────────────────────
 *
 * A scanned document is a picture of a page. It has no text layer, so
 * extraction returns nothing, and nothing is indistinguishable from a blank
 * file unless somebody says otherwise. It is also extremely common — a
 * supplier invoice photographed and mailed is most of what an SME actually
 * holds — so it is reported as its own outcome with the reason and the
 * remedy, not as a failure and not as success with no words in it.
 */
import { extractText, getDocumentProxy } from 'unpdf';

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfError';
  }
}

export interface PdfText {
  text: string;
  pages: number;
  /** True where the file has pages and none of them carry a text layer. */
  scanned: boolean;
}

/** A page of dense text is roughly 3,000 characters, so this is ~300 pages. */
export const MAX_TEXT_CHARS = 1_000_000;

export async function readPdf(bytes: Uint8Array): Promise<PdfText> {
  let pages = 0;
  let text = '';

  try {
    // A copy, because pdf.js transfers ownership of the buffer it is given and
    // the caller still needs these bytes to store the file afterwards. Without
    // it the upload writes an empty object and nothing says why.
    const document = await getDocumentProxy(new Uint8Array(bytes));
    // mergePages narrows the return type to a single string; without it the
    // text comes back per page and the caller has to join it.
    const extracted = await extractText(document, { mergePages: true });
    pages = extracted.totalPages;
    text = extracted.text;
  } catch (error) {
    throw new PdfError(explain(error));
  }

  return {
    text: tidy(text).slice(0, MAX_TEXT_CHARS),
    pages,
    scanned: pages > 0 && tidy(text) === '',
  };
}

/**
 * pdf.js's own failures, in words for the person who chose the file.
 *
 * Matched on the error's name rather than its message: the names are part of
 * pdf.js's API and the messages are not, so a message match would quietly stop
 * working at some upgrade and every PDF would start failing with the generic
 * sentence.
 */
function explain(error: unknown): string {
  const name = error instanceof Error ? error.name : '';

  if (name === 'PasswordException') {
    return 'That PDF is password-protected. Open it, save a copy without the password, and upload that — the file is stored either way, but we cannot read a locked one.';
  }
  if (name === 'InvalidPDFException') {
    return 'That file is named as a PDF but is damaged or is not one. It has been kept exactly as you sent it.';
  }

  return 'We could not read the text out of that PDF. It has been kept exactly as you sent it.';
}

/**
 * Extraction leaves artefacts, and they are not cosmetic.
 *
 * pdf.js emits one item per positioned run, so a justified paragraph arrives
 * with runs of spaces where the typesetter stretched it, and a two-column page
 * arrives with a line break at every column edge. Left alone, a search for
 * "payment terms" misses a document that plainly contains it.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
