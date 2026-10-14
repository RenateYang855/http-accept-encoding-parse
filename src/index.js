/**
 * HTTP Accept-Encoding header parser.
 *
 * Exposes a single function that turns a raw Accept-Encoding string into an
 * ordered list of codings with their quality values. Identity and the
 * legacy x-compress alias are resolved so callers can treat the output as a
 * concrete preference list.
 */

import { parseAcceptEncoding } from './core.js';

export { parseAcceptEncoding };
