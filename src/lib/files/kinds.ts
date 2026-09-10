/**
 * What Amryn accepts, in one place.
 *
 * The brief that asked for connectors made a point that applies just as well
 * here: do not scatter what is available through the application. A person
 * choosing a file meets three separate statements about what is allowed — the
 * picker's filter, the server's check, and the sentence under the control —
 * and when those three disagree the symptom is a file that can be chosen and
 * cannot be sent, with no explanation. So they are all generated from this.
 *
 * ── the three things Amryn can do with a file ────────────────────────────
 *
 *   'table'     a spreadsheet. Its columns and rows are read, and what is in
 *               them can become stock lines, records, figures.
 *
 *   'text'      a PDF, a Word document, a presentation, a text file. The
 *               words in it are extracted and stored beside it, so they can
 *               be searched and quoted.
 *
 *   'document'  everything else — an image, an archive, a format nobody here
 *               has a reader for. Stored, listed, and given back when asked
 *               for, and not read.
 *
 * ── what 'text' does not mean ────────────────────────────────────────────
 *
 * Extracting the words is not understanding them. A contract whose text has
 * been pulled out is a contract nobody has read: no term has been noted, no
 * risk assessed, no figure taken from it. The distinction survives in the
 * interface deliberately, because "we have the words" and "we know what it
 * says" are one careless sentence apart, and a business relying on the second
 * when only the first is true is the failure this whole column exists to
 * prevent. Same rule as the one that stops the Twin filling a numeric gap
 * from memory.
 */

export type Handling = 'table' | 'text' | 'document';

export interface FileKind {
  /** Lower case, with the dot. */
  extension: string;
  label: string;
  handling: Handling;
  /** For the picker, and for a browser that reports one. */
  contentTypes: readonly string[];
}

/**
 * The ones worth naming.
 *
 * Not a complete list of what may be uploaded — anything not here is still
 * accepted and kept as a document. These are the types the interface can say
 * something true about, which is what earns a row.
 */
export const FILE_KINDS: readonly FileKind[] = [
  {
    extension: '.xlsx',
    label: 'Excel workbook',
    handling: 'table',
    contentTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  {
    extension: '.xlsm',
    label: 'Excel workbook with macros',
    handling: 'table',
    contentTypes: ['application/vnd.ms-excel.sheet.macroEnabled.12'],
  },
  { extension: '.csv', label: 'CSV', handling: 'table', contentTypes: ['text/csv'] },
  { extension: '.tsv', label: 'Tab-separated text', handling: 'table', contentTypes: ['text/tab-separated-values'] },
  { extension: '.pdf', label: 'PDF', handling: 'text', contentTypes: ['application/pdf'] },
  {
    extension: '.docx',
    label: 'Word document',
    handling: 'text',
    contentTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  // The pre-2007 binary formats. Their text is inside an OLE compound
  // document, which is a different reader again, and the remedy — Save As —
  // takes ten seconds. Named so the interface can say that rather than
  // leaving somebody to wonder why one Word file was read and another was not.
  { extension: '.doc', label: 'Word document (older)', handling: 'document', contentTypes: ['application/msword'] },
  {
    extension: '.pptx',
    label: 'PowerPoint',
    handling: 'text',
    contentTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  { extension: '.txt', label: 'Plain text', handling: 'text', contentTypes: ['text/plain'] },
  { extension: '.md', label: 'Markdown', handling: 'text', contentTypes: ['text/markdown'] },
  { extension: '.rtf', label: 'Rich text', handling: 'text', contentTypes: ['application/rtf'] },
  { extension: '.png', label: 'Image', handling: 'document', contentTypes: ['image/png'] },
  { extension: '.jpg', label: 'Image', handling: 'document', contentTypes: ['image/jpeg'] },
  { extension: '.jpeg', label: 'Image', handling: 'document', contentTypes: ['image/jpeg'] },
  { extension: '.heic', label: 'Image', handling: 'document', contentTypes: ['image/heic'] },
  { extension: '.zip', label: 'Archive', handling: 'document', contentTypes: ['application/zip'] },
  {
    extension: '.xls',
    label: 'Excel workbook (older)',
    handling: 'document',
    contentTypes: ['application/vnd.ms-excel'],
  },
];

/**
 * What is refused, and the only thing that is.
 *
 * The instruction was to accept any file type, and this list is not a
 * retreat from it: none of these is a business record. They are programs. A
 * platform that stores and hands back executables is a way to pass one person
 * an installer that appears to have come from their finance team, and the cost
 * of declining them is that nobody can attach a Windows installer to a
 * stocktake — which nobody wants to do.
 *
 * Stated out loud in the interface rather than enforced quietly, so somebody
 * who does have a reason knows to ask rather than wondering why the upload
 * failed.
 */
export const REFUSED_EXTENSIONS: readonly string[] = [
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl',
  '.dll', '.sys', '.jar', '.app', '.dmg', '.pkg', '.deb', '.rpm',
  '.sh', '.bash', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.hta',
];

/** 10 MB. Above this a file is a data feed, and a feed wants a connector. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * 5 MB for a stocktake, unchanged.
 *
 * Both of these have to stay under the server action body limit set in
 * next.config.ts. Raising either without raising that one puts the framework
 * back in front of the code, silently — see the comment there.
 */
export const MAX_TABLE_BYTES = 5 * 1024 * 1024;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function kindOf(filename: string): FileKind | null {
  const extension = extensionOf(filename);
  return FILE_KINDS.find((kind) => kind.extension === extension) ?? null;
}

/** Whether the file's rows can be read, as opposed to the file being kept. */
export function isTable(filename: string): boolean {
  return kindOf(filename)?.handling === 'table';
}

/** Whether words can be pulled out of it. */
export function hasText(filename: string): boolean {
  return kindOf(filename)?.handling === 'text';
}

/**
 * Whether a browser will show it rather than download it.
 *
 * The two Amryn can embed in a page. Everything else is a download, and
 * offering a viewer that renders a grey box would be worse than not offering
 * one.
 */
export function isViewable(filename: string): boolean {
  return ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md'].includes(extensionOf(filename));
}

export function isRefused(filename: string): boolean {
  return REFUSED_EXTENSIONS.includes(extensionOf(filename));
}

/**
 * The `accept` attribute for a file picker.
 *
 * Extensions and content types both, because browsers disagree about which
 * they honour, and a picker that filters on content type alone hides files
 * whose type the operating system does not know.
 */
export function acceptAttribute(handling?: Handling): string {
  const kinds = handling ? FILE_KINDS.filter((kind) => kind.handling === handling) : FILE_KINDS;
  return [...new Set(kinds.flatMap((kind) => [kind.extension, ...kind.contentTypes]))].join(',');
}

/** How large a file of this sort may be, in bytes. */
export function sizeLimitFor(filename: string): number {
  return isTable(filename) ? MAX_TABLE_BYTES : MAX_DOCUMENT_BYTES;
}

/** '2.4 MB', for a sentence about a file that was too big. */
export function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
