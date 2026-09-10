/**
 * One way in for the words in a file.
 *
 * table.ts does this for rows and columns; this does it for prose. Same shape
 * on purpose: content decides over the extension, the failure is a sentence
 * written for the person who chose the file, and the caller has one function
 * to call and one error to catch.
 */
import { hasText, extensionOf } from './kinds';
import { readPdf, PdfError, MAX_TEXT_CHARS } from './pdf';
import { readOfficeText, OfficeTextError } from './office-text';
import { isLegacyExcel } from './xlsx';

export { MAX_TEXT_CHARS } from './pdf';

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface Extracted {
  text: string;
  /** Pages for a PDF, slides for a presentation, zero where there is no such unit. */
  pages: number;
  /** The file has pages and none of them carry words — a photograph of paper. */
  scanned: boolean;
  /** The text was longer than we store and has been cut. */
  truncated: boolean;
}

/**
 * The words, or a refusal that says which kind of file this is.
 *
 * @throws ExtractionError, always with a remedy where one exists.
 */
export async function extractDocumentText(
  filename: string,
  bytes: Uint8Array,
): Promise<Extracted> {
  if (bytes.length === 0) throw new ExtractionError('That file is empty.');

  // '%PDF' — checked in the bytes, because a PDF arrives named .pdf, named
  // .PDF, and occasionally named nothing at all.
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    try {
      const result = await readPdf(bytes);
      return { ...result, truncated: result.text.length >= MAX_TEXT_CHARS };
    } catch (error) {
      throw new ExtractionError(error instanceof PdfError ? error.message : 'We could not read that PDF.');
    }
  }

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const result = readOfficeText(bytes);
      const text = result.text.slice(0, MAX_TEXT_CHARS);
      return {
        text,
        pages: result.parts,
        scanned: false,
        truncated: result.text.length > MAX_TEXT_CHARS,
      };
    } catch (error) {
      throw new ExtractionError(
        error instanceof OfficeTextError ? error.message : 'We could not read that document.',
      );
    }
  }

  if (isLegacyExcel(bytes)) {
    // .doc, .ppt and .xls all begin this way. The text is inside an OLE
    // compound document, which is a third reader nobody has written here, and
    // the remedy takes ten seconds.
    throw new ExtractionError(
      'That is a pre-2007 Office file. Open it and use Save As to make a .docx, .xlsx or .pptx — the file is kept either way, but we cannot read a binary one.',
    );
  }

  if (hasText(filename)) {
    // Plain text, markdown, rich text. Decoded rather than parsed: an RTF's
    // control words come through as words, which is untidy and still finds
    // what somebody searches for.
    const text = new TextDecoder('utf-8').decode(bytes.subarray(0, MAX_TEXT_CHARS * 4)).trim();
    return {
      text: text.slice(0, MAX_TEXT_CHARS),
      pages: 0,
      scanned: false,
      truncated: text.length > MAX_TEXT_CHARS,
    };
  }

  throw new ExtractionError(
    `We have no reader for ${extensionOf(filename) || 'that kind of file'}, so it is kept as it is.`,
  );
}
