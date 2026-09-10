# Test fixtures

Two PDFs, generated once by headless Chromium — a real PDF producer, not this
repository — so the reader is tested against the shape of file a customer
actually sends rather than against something written to satisfy it.

| File | What it is | Why it exists |
|---|---|---|
| `text-layer.pdf` | A page of ordinary text | The normal case: pages, words, a currency figure that must survive extraction intact |
| `scanned.pdf` | A page whose only content is an image | A photographed invoice. It has a page and no text layer, so extraction returns nothing — and "nothing" must be reported as a scan rather than as an empty document, because most of what a small business holds arrives this way |

Regenerate with Playwright's Chromium and `page.pdf()`; the second is an
`<img>` filling the page and nothing else. Neither carries content from
anywhere else, so there is no licence question about committing them.
