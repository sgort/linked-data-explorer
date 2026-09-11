/**
 * The only ronl:* attributes the modeler writes. Typed as a closed union so the
 * attribute name interpolated into the RegExps below is a compile-time literal,
 * never data -- which is what makes those RegExps safe, and what the nosemgrep
 * directives on them rely on.
 */
export type RonlAttr = 'language' | 'organization' | 'ropaRef' | 'dsoActiviteitUrn';

// Values are written into an XML attribute, so they are escaped on the way in and
// decoded on the way out; & first when escaping and last when decoding, or an
// already-escaped entity would be mangled.
const escapeXmlAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const decodeXmlAttr = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Rewrites a single ronl:* attribute on the <bpmn:process> tag. */
export function applyRonlAttr(xml: string, attr: RonlAttr, value: string | undefined): string {
  let out = xml;
  if (!out.includes('xmlns:ronl=')) {
    out = out.replace(/(<(?:bpmn:)?definitions\b)/, '$1 xmlns:ronl="http://ronl.nl/schema/1.0"');
  }
  if (value) {
    const attribute = `ronl:${attr}="${escapeXmlAttr(value)}"`;
    // Replacer functions, not replacement strings: in a replacement string $1, $&
    // and $' are expanded, so a value containing them pasted captured groups, the
    // matched tag or the rest of the document into the attribute.
    if (out.includes(`ronl:${attr}=`)) {
      // attr is a RonlAttr literal and [^"]* is linear: no injection, no backtracking.
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
      out = out.replace(new RegExp(`ronl:${attr}="[^"]*"`), () => attribute);
    } else {
      out = out.replace(
        /(<(?:bpmn:)?process\b[^>]*?)(\/?>)/,
        (_match, head: string, close: string) => `${head} ${attribute}${close}`
      );
    }
  } else {
    // attr is a RonlAttr literal and [^"]* is linear: no injection, no backtracking.
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    out = out.replace(new RegExp(`\\s*ronl:${attr}="[^"]*"`), '');
  }
  return out;
}

/** Reads a single ronl:* attribute from the XML, or undefined when absent. */
export function readRonlAttr(xml: string, attr: RonlAttr): string | undefined {
  // attr is a RonlAttr literal and [^"]* is linear: no injection, no backtracking.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const m = xml.match(new RegExp(`ronl:${attr}="([^"]+)"`));
  return m?.[1] === undefined ? undefined : decodeXmlAttr(m[1]);
}
