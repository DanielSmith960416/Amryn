/**
 * The one piece of XML handling both readers need.
 *
 * Office formats escape their text, so `Notes & remarks` is stored as
 * `Notes &amp; remarks` and a reader that skipped this step would put the
 * escape sequence into a customer's records. It lives here because the
 * workbook reader and the document reader both need exactly this and nothing
 * else, and two copies of an entity table is how one of them ends up missing
 * a case the other has.
 */
export function unescapeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code =
          entity.startsWith('#x') || entity.startsWith('#X')
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
    }
  });
}

/** The value of one attribute, from the text between a tag's angle brackets. */
export function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name.replace(':', '\\:')}\\s*=\\s*"([^"]*)"`).exec(attributes);
  return match?.[1] ?? null;
}
