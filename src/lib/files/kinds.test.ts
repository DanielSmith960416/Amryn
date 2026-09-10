import { describe, expect, it } from 'vitest';
import {
  acceptAttribute,
  describeBytes,
  extensionOf,
  isRefused,
  isTable,
  kindOf,
  MAX_DOCUMENT_BYTES,
  MAX_TABLE_BYTES,
  sizeLimitFor,
} from './kinds';

describe('what a file is', () => {
  it('reads the extension case-insensitively, because Windows shouts', () => {
    expect(extensionOf('COUNT.XLSX')).toBe('.xlsx');
    expect(extensionOf('report.final.pdf')).toBe('.pdf');
    expect(extensionOf('Makefile')).toBe('');
  });

  it('knows which kinds have rows in them', () => {
    expect(isTable('count.xlsx')).toBe(true);
    expect(isTable('count.csv')).toBe(true);
    // The older binary format cannot be read, so it is kept rather than
    // promised — the catalogue says 'document' and the reader agrees.
    expect(isTable('count.xls')).toBe(false);
    expect(isTable('contract.pdf')).toBe(false);
  });

  it('treats an unknown extension as something to keep, not something to refuse', () => {
    // The instruction was to accept any file type. An unlisted extension is a
    // file we have nothing clever to say about, which is not a reason to
    // decline it.
    expect(kindOf('scan.tiff')).toBeNull();
    expect(isRefused('scan.tiff')).toBe(false);
    expect(isTable('scan.tiff')).toBe(false);
  });

  it('refuses programs', () => {
    for (const name of ['setup.exe', 'run.BAT', 'thing.dmg', 'script.ps1']) {
      expect(isRefused(name), name).toBe(true);
    }
  });
});

describe('limits', () => {
  it('gives a spreadsheet the tighter one, because its rows are read as well as stored', () => {
    expect(sizeLimitFor('count.xlsx')).toBe(MAX_TABLE_BYTES);
    expect(sizeLimitFor('contract.pdf')).toBe(MAX_DOCUMENT_BYTES);
  });

  it('stays under the server action body limit set in next.config.ts', () => {
    // 12 MB there. If either of these ever exceeds it, the framework refuses
    // the request before the action runs and the person uploading sees
    // nothing happen at all — which is the defect this whole change began
    // with, and this is the assertion that stops it coming back.
    expect(Math.max(MAX_DOCUMENT_BYTES, MAX_TABLE_BYTES)).toBeLessThan(12 * 1024 * 1024);
  });

  it('describes a size the way a person would say it', () => {
    expect(describeBytes(512)).toBe('512 bytes');
    expect(describeBytes(2048)).toBe('2 KB');
    expect(describeBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('the picker filter', () => {
  it('offers extensions and content types both, because browsers disagree', () => {
    const accept = acceptAttribute('table');
    expect(accept).toContain('.xlsx');
    expect(accept).toContain('.csv');
    expect(accept).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('does not offer a stocktake picker anything it cannot read', () => {
    expect(acceptAttribute('table')).not.toContain('.pdf');
  });
});
