import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalFooter } from './legal-footer';

afterEach(cleanup);

/*
 * The version moved here from the foot of the navigation rail, where it was
 * visible only with the rail open and, on a phone, only behind the menu
 * button. These pin the two halves of that: it shows on a platform page, and
 * it does not leak onto the signed-out pages that render the same footer.
 */
describe('the footer every page ends with', () => {
  it('carries the documents somebody goes looking for', () => {
    render(<LegalFooter />);
    for (const label of ['Privacy', 'Terms', 'Cookies', 'Data Processing']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('shows the version where the rest of the small print is', () => {
    render(<LegalFooter version="2.0.0" />);
    expect(screen.getByText('v2.0.0')).toBeTruthy();
  });

  /*
   * Sign-in, the organisation set-up page and the Imprint layers all render
   * this footer, and none of them passes a version. A build number on a page
   * nobody has signed in to says nothing to the reader and something to
   * anybody enumerating deployments.
   */
  it('says nothing about the build where none was given', () => {
    const { container } = render(<LegalFooter />);
    expect(container.textContent).not.toMatch(/\bv\d/);
  });
});
