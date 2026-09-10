import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { extractDocumentText, ExtractionError } from './extract';
import { readOfficeText, OfficeTextError } from './office-text';

/** Same builder as xlsx.test.ts — an Office file is a ZIP of XML either way. */
function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const deflated = new Uint8Array(deflateRawSync(raw));

    const local = new Uint8Array(30 + nameBytes.length + deflated.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(18, deflated.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(deflated, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(20, deflated.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const directorySize = centrals.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centrals.length, true);
  endView.setUint16(10, centrals.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const wordFile = (body: string) => zip({ 'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>` });

describe('a Word document', () => {
  it('puts a paragraph back together from the runs Word split it into', () => {
    // Word breaks a paragraph at every formatting change and every spell-check
    // boundary, so one sentence is routinely three runs. Joined without a
    // separator, or "Panado" and "500mg" arrive with a space that was not
    // typed — or worse, on separate lines.
    const bytes = wordFile(
      '<w:p><w:r><w:t>Pan</w:t></w:r><w:r><w:t>ado </w:t></w:r><w:r><w:t>500mg</w:t></w:r></w:p>',
    );
    expect(readOfficeText(bytes).text).toBe('Panado 500mg');
  });

  it('keeps paragraphs as lines and a break as a break, in the order they appear', () => {
    // The ordering trap: a break sits *between* two runs, so a reader that
    // gathered the runs first and the breaks afterwards would put every line
    // break at the end of the paragraph.
    const bytes = wordFile(
      '<w:p><w:r><w:t>Terms</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Net 30</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Signed</w:t></w:r></w:p>',
    );
    expect(readOfficeText(bytes).text).toBe('Terms\nNet 30\nSigned');
  });

  it('unescapes what XML escaped', () => {
    expect(readOfficeText(wordFile('<w:p><w:r><w:t>R&amp;D &lt; 5%</w:t></w:r></w:p>')).text).toBe(
      'R&D < 5%',
    );
  });

  it('collapses the blank paragraphs people use as spacing', () => {
    const bytes = wordFile('<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p/><w:p/><w:p/><w:p><w:r><w:t>Two</w:t></w:r></w:p>');
    expect(readOfficeText(bytes).text).toBe('One\n\nTwo');
  });
});

describe('a presentation', () => {
  it('reads slides in their own order, not in alphabetical order', () => {
    // 'slide10.xml' sorts before 'slide2.xml' as text. A deck of eleven slides
    // read that way is silently reordered, which is the kind of wrong that
    // looks right.
    const slide = (text: string) => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
    const bytes = zip({
      'ppt/slides/slide1.xml': slide('First'),
      'ppt/slides/slide2.xml': slide('Second'),
      'ppt/slides/slide10.xml': slide('Tenth'),
    });

    const result = readOfficeText(bytes);
    expect(result.parts).toBe(3);
    expect(result.text).toBe('[Slide 1]\nFirst\n\n[Slide 2]\nSecond\n\n[Slide 3]\nTenth');
  });

  it('refuses an Office archive with neither a document nor slides', () => {
    expect(() => readOfficeText(zip({ 'a.txt': 'hello' }))).toThrow(OfficeTextError);
  });
});

/**
 * A PDF from a real producer, committed rather than built here.
 *
 * Everything else in this file is assembled by the test, which is the right
 * trade for a ZIP of XML — the format is legible and the builder is the
 * specification restated. A PDF is not: a reader that only ever meets output
 * written to satisfy it proves nothing about the files customers send. These
 * two came out of headless Chromium. See fixtures/README.md.
 */
function fixture(name: string): Promise<Uint8Array> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url)).then((b) => new Uint8Array(b));
}

describe('the dispatcher', () => {
  it('reads a real PDF, and reports its pages', async () => {
    const result = await extractDocumentText('procedure.pdf', await fixture('text-layer.pdf'));

    expect(result.pages).toBe(1);
    expect(result.scanned).toBe(false);
    expect(result.text).toContain('Amryn stocktake procedure');
    // The figure matters more than the sentence. A currency amount that
    // survives extraction intact is the difference between a searchable
    // document and a misleading one.
    expect(result.text).toContain('R42.50');
  });

  it('calls a page with no text layer a scan, rather than an empty document', async () => {
    // The two are indistinguishable from the outside — no words either way —
    // and they need completely different sentences on the page. A photographed
    // invoice is most of what a small business actually holds.
    const result = await extractDocumentText('invoice.pdf', await fixture('scanned.pdf'));

    expect(result.pages).toBe(1);
    expect(result.text).toBe('');
    expect(result.scanned).toBe(true);
  });

  it('leaves the caller its bytes, so the file can still be stored', async () => {
    // pdf.js takes ownership of the buffer it is handed. Without a copy the
    // upload writes an empty object to storage afterwards and nothing says why.
    const bytes = await fixture('text-layer.pdf');
    const before = bytes.length;

    await extractDocumentText('procedure.pdf', bytes);

    expect(bytes.length).toBe(before);
    expect(bytes[0]).toBe(0x25); // still '%PDF'
  });

  it('goes by the bytes, so a PDF named anything is still a PDF', async () => {
    await expect(
      extractDocumentText('no-extension', await fixture('text-layer.pdf')),
    ).resolves.toMatchObject({ pages: 1 });
  });

  it('names the pre-2007 formats and gives the remedy', async () => {
    const ole = new Uint8Array(64);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(extractDocumentText('contract.doc', ole)).rejects.toThrow(/Save As/i);
  });

  it('reads a plain text file as itself', async () => {
    const bytes = new TextEncoder().encode('Invoice 4192\nDue 30 days\n');
    const result = await extractDocumentText('note.txt', bytes);
    expect(result.text).toBe('Invoice 4192\nDue 30 days');
    expect(result.pages).toBe(0);
  });

  it('refuses a format it has no reader for, rather than returning nothing', async () => {
    // Silence would be indistinguishable from a document with no words in it,
    // and the two need different sentences on the page.
    await expect(extractDocumentText('photo.png', new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      ExtractionError,
    );
  });

  it('says an empty file is empty', async () => {
    await expect(extractDocumentText('x.pdf', new Uint8Array(0))).rejects.toThrow(/empty/i);
  });
});
