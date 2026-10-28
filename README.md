# http-accept-encoding-parse

Parses an HTTP `Accept-Encoding` header into a ranked list of codings with q-values, resolving the `identity` wildcard and the legacy `x-compress` alias.

```js
import { parseAcceptEncoding } from 'http-accept-encoding-parse';

const codings = parseAcceptEncoding('gzip;q=0.8, br;q=0.3, *;q=0');
// [
//   { coding: 'gzip', q: 0.8 },
//   { coding: 'br', q: 0.3 },
//   { coding: '*', q: 0 },
//   { coding: 'identity', q: 0.5 },
// ]
```

## Why this exists

Real-world `Accept-Encoding` headers mix canonical tokens (`gzip`, `br`), legacy aliases (`x-compress`), the identity coding, and the `*` wildcard — each with optional `q`-values that may be malformed, quoted, or out of range. Content-negotiation code that tries to read these inline tends to grow into a pile of regexes that disagree with each other. This library centralises that parsing so the negotiation step only has to compare tokens.

The trade-off: the parser is deliberately non-validating. It does not reject unknown codings or syntactically odd parameters; it extracts what it can and leaves the rest as-is. A stricter parser would reject headers that real clients send.

## Edge cases you will hit

- **`identity` is appended at `q=0.5` when the header does not mention it**, per RFC 9110 §12.5.4. If the header explicitly forbids everything (`*;q=0`) the appended identity still carries `q=0.5`; the caller is responsible for honouring the wildcard prohibition. This keeps the parser a pure syntactic transform.
- **`x-compress` is normalised to `compress`**; `x-gzip` is not, because in modern practice `x-gzip` and `gzip` are distinct tokens and collapsing them would hide client intent.
- **`q`-values are clamped to `[0, 1]` and rounded to three decimals**. A `q=1.5` becomes `1`; `q=abc` defaults to `1` (the parameter is treated as unrecognised and ignored per RFC 9110).
- **Order is preserved from the header**; the output is not re-sorted by `q`. Sort it yourself if you need that.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

