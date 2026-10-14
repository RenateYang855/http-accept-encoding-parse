/**
 * Core parser for the HTTP Accept-Encoding header.
 *
 * Design notes (the WHY):
 *
 * - Identity is the implicit default: RFC 9110 §12.5.4 says a server MAY use
 *   identity when it is not explicitly forbidden. We surface it so callers do
 *   not have to re-derive that rule.
 *
 * - The legacy alias x-compress (RFC 1945 §10.3) is normalised to "compress"
 *   so downstream content-negotiation only ever sees the canonical token.
 *   We do NOT collapse other tokens: gzip and x-gzip are distinct in modern
 *   practice and mapping them would hide real client intent.
 *
 * - The wildcard "*" is an Accept-Encoding-specific construct (RFC 9110
 *   §12.5.4). When present with a non-zero q it covers every coding the
 *   server knows about that the client did not list; when q=0 it forbids any
 *   unlisted coding. We keep it in the output as the literal token "*" so the
 *   caller can distinguish it from a named coding.
 *
 * - Ordering preserves client intent: the original header order is kept,
 *   ties broken by appearance. We do not re-sort by q-value because the
 *   caller may need to know the original sequence (e.g. for debug headers).
 *   Sorting is a one-liner the caller can apply if they want it.
 *
 * - q-values are clamped to [0, 1] and truncated to three decimals per RFC
 *   9110 §12.5.1. A malformed q (e.g. "0.9999" or "1.5") becomes 1, a
 *   negative one becomes 0. We round to the nearest thousandth so that
 *   0.333 stays 0.333 instead of becoming 0.33.
 */

/**
 * @typedef {Object} Coding
 * @property {string} coding  Canonical coding token (e.g. "gzip", "identity",
 *                            "compress", or "*" for the wildcard).
 * @property {number} q       Quality value in the range [0, 1], rounded to
 *                            three decimal places.
 */

const ALIASES = {
  'x-compress': 'compress',
};

/**
 * Clamp a parsed q-value to [0, 1] and round to three decimals.
 *
 * We round rather than truncate so that 0.0005 becomes 0.001 (the nearest
 * representable thousandth) instead of silently dropping to 0. RFC 9110
 * allows at most three digits after the point, so anything finer is noise.
 *
 * @param {number} raw
 * @returns {number}
 */
function normaliseQ(raw) {
  if (!Number.isFinite(raw)) return 1;
  let v = raw;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  return Math.round(v * 1000) / 1000;
}

/**
 * Parse a single q-value suffix like ";q=0.8".
 *
 * Returns 1 when the parameter is absent or not a recognisable q-value so
 * that a bare "gzip" is equivalent to "gzip;q=1". A syntactically present
 * but unparseable q (e.g. ";q=abc") is treated as a parameter we do not
 * understand, which RFC 9110 says we MAY ignore — hence 1, not 0.
 *
 * @param {string} param  A single parameter segment, already trimmed.
 * @returns {number}
 */
function qFromParam(param) {
  if (param.length === 0) return 1;
  const eq = param.indexOf('=');
  if (eq === -1) return 1;
  const name = param.slice(0, eq).trim().toLowerCase();
  if (name !== 'q') return 1;
  const rawVal = param.slice(eq + 1).trim();
  // Strip surrounding quotes — some clients quote the value.
  const unquoted = rawVal.startsWith('"') && rawVal.endsWith('"') && rawVal.length >= 2
    ? rawVal.slice(1, -1)
    : rawVal;
  // A leading "+" is accepted by parseFloat; reject it to stay strict-ish.
  if (unquoted.length === 0) return 1;
  if (unquoted[0] === '+') return 1;
  const parsed = Number.parseFloat(unquoted);
  if (Number.isNaN(parsed)) return 1;
  return normaliseQ(parsed);
}

/**
 * Extract the q-value from the tail of a single coding segment.
 *
 * @param {string[]} params  Parameters already split on ";", may be empty.
 * @returns {number}
 */
function qFromParams(params) {
  let q = 1;
  for (const p of params) {
    const candidate = qFromParam(p);
    // First q wins: RFC 9110 says a parameter appearing more than once is
    // ill-formed, and we resolve the ambiguity by taking the first.
    if (p.trim().toLowerCase().startsWith('q=')) {
      q = candidate;
      break;
    }
  }
  return q;
}

/**
 * Parse an Accept-Encoding header value.
 *
 * @param {string} header  Raw header value, may be empty or null/undefined.
 * @returns {Coding[]}     Ordered list of codings. Empty input yields [].
 */
export function parseAcceptEncoding(header) {
  if (header == null) return [];
  const text = String(header).trim();
  if (text.length === 0) return [];

  /** @type {Coding[]} */
  const out = [];
  let sawIdentity = false;

  const parts = text.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;

    const semi = trimmed.indexOf(';');
    let token = semi === -1 ? trimmed : trimmed.slice(0, semi);
    token = token.trim().toLowerCase();
    if (token.length === 0) continue;

    const paramStr = semi === -1 ? '' : trimmed.slice(semi + 1);
    const params = paramStr.length === 0 ? [] : paramStr.split(';');
    const q = qFromParams(params);

    if (token === 'identity') {
      sawIdentity = true;
      out.push({ coding: 'identity', q });
      continue;
    }

    const canonical = ALIASES[token] ?? token;
    out.push({ coding: canonical, q });
  }

  // RFC 9110 §12.5.4: if the Accept-Encoding header is present and does not
  // mention identity, identity is acceptable with a q-value of 0.5 unless
  // the wildcard forbids everything (q=0), in which case identity is still
  // acceptable at 0. The caller can decide; we surface the default so they
  // do not have to re-derive it.
  if (!sawIdentity) {
    out.push({ coding: 'identity', q: 0.5 });
  }

  return out;
}
