import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { meanConfidence, ocrAvailable, readScannedPdf, OcrError } from './ocr';
import { extractDocumentText } from './extract';

function fixture(name: string): Promise<Uint8Array> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url)).then((b) => new Uint8Array(b));
}

/**
 * These need Tesseract and poppler, which the worker image carries and a
 * contributor's laptop may not. Skipped rather than failed where they are
 * absent: a red suite that means "you have not installed two apt packages"
 * teaches people to ignore red suites.
 */
const available = await ocrAvailable();
const withOcr = available.ready ? describe : describe.skip;

describe('the confidence figure', () => {
  it('averages the words and ignores the structural rows', () => {
    // Tesseract's TSV carries a row per page, block, paragraph and line with
    // a confidence of -1 and no word. Counting those drags every page toward
    // the same meaningless number.
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t',
      '5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t90\tPanado',
      '5\t1\t1\t1\t1\t2\t70\t10\t50\t20\t80\t500mg',
    ].join('\n');

    expect(meanConfidence(tsv)).toBe(85);
  });

  it('returns null rather than zero when nothing was recognised', () => {
    // Zero is a confidence. Null is the absence of one, and a page that
    // reported nothing must not read as a page the engine was certain was
    // wrong.
    expect(meanConfidence('level\tconf\ttext')).toBeNull();
    expect(meanConfidence('')).toBeNull();
  });
});

withOcr('reading a scan', () => {
  it('gets the words off a page that has no text layer', async () => {
    const bytes = await fixture('scanned-invoice.pdf');

    // The premise first: this is genuinely a scan. If extraction ever starts
    // finding text in it, the fixture has stopped being what this tests.
    const extracted = await extractDocumentText('invoice.pdf', bytes);
    expect(extracted.scanned).toBe(true);
    expect(extracted.text).toBe('');

    const result = await readScannedPdf(bytes);

    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBe(0);
    expect(result.text).toContain('Kimberley Pharmaceutical Supplies');
    expect(result.text).toContain('INV-2026-04417');
  }, 120_000);

  it('reports how sure it is, because it is often not very', async () => {
    const result = await readScannedPdf(await fixture('scanned-invoice.pdf'));

    expect(result.confidence).not.toBeNull();
    expect(result.confidence!).toBeGreaterThan(50);
    expect(result.confidence!).toBeLessThanOrEqual(100);
  }, 120_000);

  it('reports progress per page, so a long job can renew its lease', async () => {
    // Not decoration. The queue takes a job away from a worker that stops
    // heartbeating, and a fifty-page scan takes longer than the lease.
    const seen: number[] = [];
    await readScannedPdf(await fixture('scanned-invoice.pdf'), (done) => {
      seen.push(done);
    });

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBe(1);
  }, 120_000);

  it('refuses something that is not a PDF, rather than producing nonsense', async () => {
    await expect(readScannedPdf(new TextEncoder().encode('this is not a pdf'))).rejects.toThrow(
      OcrError,
    );
  }, 60_000);
});
