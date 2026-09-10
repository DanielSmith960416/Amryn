/**
 * Words out of a Word document or a presentation.
 *
 * Both are ZIP archives of XML, which the workbook reader already opens, so
 * this is forty lines rather than a dependency. It is the same trade as
 * xlsx.ts and made for the same reason — except that here the argument is
 * stronger still, because the machinery is already in the repository and the
 * only new thing is knowing which element holds the text.
 *
 * ── what it takes, and what it leaves ────────────────────────────────────
 *
 * The words, in reading order, with paragraph and slide breaks kept because
 * they are what makes the result legible to a person scanning it. Not the
 * formatting, not the tables' structure, not the comments, not the tracked
 * changes, not the headers and footers. A contract's text is the thing worth
 * having; its margins are not.
 */
import { ArchiveError, unzip } from './zip';
import { unescapeXml } from './xml';

export class OfficeTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeTextError';
  }
}

export interface OfficeText {
  text: string;
  /** Slides, for a presentation. Zero for a document, which has no such unit. */
  parts: number;
}

export function readOfficeText(bytes: Uint8Array): OfficeText {
  let files: Map<string, Uint8Array>;
  try {
    files = unzip(bytes);
  } catch (error) {
    throw new OfficeTextError(
      error instanceof ArchiveError ? error.message : 'We could not open that file.',
    );
  }

  const document = files.get('word/document.xml');
  if (document) return { text: paragraphs(decode(document), 'w'), parts: 0 };

  // Slides are numbered, and 'slide10.xml' sorts before 'slide2.xml' as text,
  // which would silently reorder a deck. Sorted by the number in the name.
  const slides = [...files.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slides.length > 0) {
    const text = slides
      .map((name, index) => {
        const body = paragraphs(decode(files.get(name)!), 'a');
        return body === '' ? '' : `[Slide ${index + 1}]\n${body}`;
      })
      .filter((part) => part !== '')
      .join('\n\n');
    return { text, parts: slides.length };
  }

  throw new OfficeTextError(
    'That file is an Office archive with neither a document nor slides inside it.',
  );
}

function slideNumber(name: string): number {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
}

/**
 * Paragraph elements, as lines.
 *
 * Word wraps each paragraph in `<w:p>` and each run of text in `<w:t>`;
 * PowerPoint uses `<a:p>` and `<a:t>` for the same two things. One function,
 * parameterised by the namespace prefix, because the shapes are identical and
 * two copies would drift.
 *
 * A run is not a word: Word splits a paragraph at every formatting change and
 * at every spell-check boundary, so "Panado 500mg" is often three runs. They
 * are joined without a separator, which is what puts the sentence back
 * together; the line break belongs at the paragraph, not between runs.
 */
function paragraphs(xml: string, prefix: 'w' | 'a'): string {
  const lines: string[] = [];

  // One expression covering both shapes, because they cannot be two: a
  // pattern for `<w:p>…</w:p>` alone also matches the opening of `<w:p/>` —
  // `/` is not `>` — and then runs on to the *next* closing tag, swallowing
  // the paragraph after it. Group 2 is undefined for the self-closing form,
  // which is how an empty paragraph stays an empty line.
  const paragraph = new RegExp(
    `<${prefix}:p\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${prefix}:p>)`,
    'g',
  );

  // Either a run of text or one of the two elements that stand for whitespace.
  // Scanned together, in one pass, because their order is the reading order:
  // a break sits *between* two runs and a pass that collected the runs first
  // would put every break at the end of the paragraph.
  const piece = new RegExp(
    `<${prefix}:t\\b[^>]*>([\\s\\S]*?)</${prefix}:t>|<${prefix}:(br|tab)\\b[^>]*/?>`,
    'g',
  );

  for (const match of xml.matchAll(paragraph)) {
    let line = '';
    for (const found of (match[2] ?? '').matchAll(piece)) {
      if (found[1] !== undefined) line += unescapeXml(found[1]);
      else line += found[2] === 'tab' ? '\t' : '\n';
    }
    lines.push(line.trim());
  }

  // Runs of blank paragraphs are spacing in the original and noise here; one
  // blank line is enough to keep the shape.
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
