import { describe, expect, it } from 'vitest';
import { admitSignals, canonicalUrl, retrievedText, retrievedUrls } from './web-research';
import type { DraftSignal } from './web-research';

/**
 * A response shaped the way the API shapes one: the model's prose in a text
 * block, and the record of what was actually retrieved in tool-result blocks
 * written server-side.
 */
const RESPONSE = [
  {
    type: 'web_search_tool_use',
    // The model's own words. Nothing here may license a citation.
    input: { query: 'Ekurhuleni catering tender 2026 https://invented.example/tender' },
  },
  {
    type: 'web_search_tool_result',
    content: [
      {
        type: 'web_search_result',
        url: 'https://www.etenders.gov.za/Home/opportunities?id=4812',
        title: 'Municipal catering supply tender',
        page_age: '2026-09-01',
      },
      {
        type: 'web_search_result',
        url: 'https://tradepress.example/gauteng-wholesale-margins',
        title: 'Wholesale margins in Gauteng',
      },
    ],
  },
  {
    type: 'web_fetch_tool_result',
    content: {
      url: 'https://www.etenders.gov.za/Home/opportunities?id=4812',
      content: {
        type: 'document',
        source: {
          data: 'Tender RFQ-4812 reopens for a 24-month supply contract valued at R 480 000 per annum. Closing 27 September 2026.',
        },
      },
    },
  },
  {
    type: 'text',
    text: 'I found one tender and one trade article.',
  },
];

const base: DraftSignal = {
  title: 'Municipal catering tender reopens',
  summary: 'A 24-month supply contract is open again.',
  sourceUrl: 'https://www.etenders.gov.za/Home/opportunities?id=4812',
};

describe('canonicalUrl', () => {
  it('treats cosmetic differences as the same document', () => {
    const a = canonicalUrl('https://www.etenders.gov.za/Home/opportunities?id=4812');
    expect(canonicalUrl('http://etenders.gov.za/Home/opportunities?id=4812#results')).toBe(a);
    expect(canonicalUrl('https://etenders.gov.za/Home/opportunities?id=4812&utm_source=x')).toBe(a);
  });

  it('keeps a query parameter that is the address', () => {
    // ?id=4812 is which tender. Dropping it would merge every tender on the
    // site into one document and let a citation point at any of them.
    expect(canonicalUrl('https://etenders.gov.za/Home/opportunities?id=4812')).not.toBe(
      canonicalUrl('https://etenders.gov.za/Home/opportunities?id=9999'),
    );
  });

  it('refuses anything that is not a web address', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('not a url')).toBeNull();
    expect(canonicalUrl('')).toBeNull();
  });
});

describe('retrievedUrls', () => {
  it('reads the retrieval record and not the model', () => {
    const urls = retrievedUrls(RESPONSE);
    expect(urls).toContain(canonicalUrl('https://www.etenders.gov.za/Home/opportunities?id=4812'));
    expect(urls).toContain(canonicalUrl('https://tradepress.example/gauteng-wholesale-margins'));
    // The URL the model typed into its own search query is not a retrieval.
    expect(urls.some((u) => u.includes('invented.example'))).toBe(false);
  });

  it('finds nothing in a response where no search ran', () => {
    expect(retrievedUrls([{ type: 'text', text: 'See https://plausible.example/report' }])).toEqual([]);
  });
});

describe('retrievedText', () => {
  it('returns what the documents said, not what the model said about them', () => {
    const text = retrievedText(RESPONSE);
    expect(text).toContain('R 480 000');
    expect(text).not.toContain('I found one tender');
  });
});

describe('admitSignals', () => {
  it('keeps a signal whose URL the search actually returned', () => {
    const { kept, rejected } = admitSignals([base], RESPONSE);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('drops a URL that reads perfectly and was never retrieved', () => {
    // The whole point. This is what a hallucinated citation looks like: right
    // shape, right domain, plausible path, and no search ever saw it.
    const invented = { ...base, sourceUrl: 'https://www.etenders.gov.za/Home/opportunities?id=5099' };
    const { kept, rejected } = admitSignals([invented], RESPONSE);
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toBe('url-was-never-retrieved');
  });

  it('drops a figure that appears in no retrieved document', () => {
    const inflated = { ...base, summary: 'A contract worth R 2 400 000 per annum.' };
    const { kept, rejected } = admitSignals([inflated], RESPONSE);
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toBe('figure-not-in-the-source');
    expect(rejected[0]?.invented?.[0]?.value).toBe(2_400_000);
  });

  it('allows the figure the source actually carries, rounded as a person would write it', () => {
    // R480k for R 480 000 is better writing than the exact figure, and #65's
    // guard derives its tolerance from the precision the output chose.
    const rounded = { ...base, summary: 'A contract worth about R480k a year.' };
    expect(admitSignals([rounded], RESPONSE).kept).toHaveLength(1);
  });

  it('accepts a named source when there is no URL to point at', () => {
    // A supplier's phone call is real attribution. Demanding a link would push
    // the honest case into inventing one, which is the failure being prevented.
    const spoken = { ...base, sourceUrl: '', sourcedFrom: 'Supplier call, 3 September' };
    expect(admitSignals([spoken], RESPONSE).kept).toHaveLength(1);
  });

  it('drops a signal with neither a retrieved URL nor a named source', () => {
    const unattributed = { ...base, sourceUrl: '', sourcedFrom: '   ' };
    const { rejected } = admitSignals([unattributed], RESPONSE);
    expect(rejected[0]?.reason).toBe('no-attribution');
  });

  it('rejects everything when the search returned nothing at all', () => {
    // The model answering from memory about a business the web does not
    // mention. Six confident signals, zero retrievals, nothing admitted.
    const { kept, rejected } = admitSignals([base, base, base], [{ type: 'text', text: 'Here is what I know.' }]);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(3);
    expect(rejected.every((r) => r.reason === 'url-was-never-retrieved')).toBe(true);
  });
});
