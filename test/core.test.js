import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAcceptEncoding } from '../src/core.js';

// q-values are rounded to three decimals and clamped to [0,1]; compare with
// a small tolerance rather than === to stay robust to float representation.
function qClose(actual, expected) {
  assert.ok(
    typeof actual === 'number',
    `expected a number, got ${typeof actual}`,
  );
  const diff = Math.abs(actual - expected);
  assert.ok(diff < 1e-6, `q ${actual} !== ${expected}`);
}

test('returns empty array for empty string', () => {
  assert.deepEqual(parseAcceptEncoding(''), []);
});

test('returns empty array for null and undefined', () => {
  assert.deepEqual(parseAcceptEncoding(null), []);
  assert.deepEqual(parseAcceptEncoding(undefined), []);
});

test('parses a single coding with default q=1 and appends identity at 0.5', () => {
  const out = parseAcceptEncoding('gzip');
  assert.equal(out.length, 2);
  assert.equal(out[0].coding, 'gzip');
  qClose(out[0].q, 1);
  assert.equal(out[1].coding, 'identity');
  qClose(out[1].q, 0.5);
});

test('parses explicit q-values', () => {
  const out = parseAcceptEncoding('gzip;q=0.8, br;q=0.3');
  assert.equal(out[0].coding, 'gzip');
  qClose(out[0].q, 0.8);
  assert.equal(out[1].coding, 'br');
  qClose(out[1].q, 0.3);
});

test('preserves order of appearance', () => {
  const out = parseAcceptEncoding('br;q=0.9, gzip;q=0.1');
  assert.equal(out[0].coding, 'br');
  assert.equal(out[1].coding, 'gzip');
});

test('normalises x-compress to compress', () => {
  const out = parseAcceptEncoding('x-compress;q=0.7');
  assert.equal(out[0].coding, 'compress');
  qClose(out[0].q, 0.7);
});

test('leaves x-gzip untouched (no alias collapse)', () => {
  const out = parseAcceptEncoding('x-gzip');
  assert.equal(out[0].coding, 'x-gzip');
});

test('explicit identity is not duplicated', () => {
  const out = parseAcceptEncoding('identity;q=0');
  assert.equal(out.length, 1);
  assert.equal(out[0].coding, 'identity');
  qClose(out[0].q, 0);
});

test('wildcard is preserved as literal token', () => {
  const out = parseAcceptEncoding('gzip;q=0.5, *;q=0');
  assert.equal(out[0].coding, 'gzip');
  assert.equal(out[1].coding, '*');
  qClose(out[1].q, 0);
});

test('q-value above 1 is clamped to 1', () => {
  const out = parseAcceptEncoding('gzip;q=1.5');
  qClose(out[0].q, 1);
});

test('negative q-value is clamped to 0', () => {
  const out = parseAcceptEncoding('gzip;q=-0.3');
  qClose(out[0].q, 0);
});

test('unparseable q defaults to 1', () => {
  const out = parseAcceptEncoding('gzip;q=abc');
  qClose(out[0].q, 1);
});

test('quoted q-value is accepted', () => {
  const out = parseAcceptEncoding('gzip;q="0.8"');
  qClose(out[0].q, 0.8);
});

test('leading plus in q is rejected (defaults to 1)', () => {
  const out = parseAcceptEncoding('gzip;q=+0.5');
  qClose(out[0].q, 1);
});

test('first q parameter wins when duplicated', () => {
  const out = parseAcceptEncoding('gzip;q=0.4;q=0.9');
  qClose(out[0].q, 0.4);
});

test('stray whitespace and trailing commas are tolerated', () => {
  const out = parseAcceptEncoding('  gzip ; q=0.6 , , br ');  
  assert.equal(out[0].coding, 'gzip');
  qClose(out[0].q, 0.6);
  assert.equal(out[1].coding, 'br');
});

test('tokens are lowercased', () => {
  const out = parseAcceptEncoding('GZIP, BR');
  assert.equal(out[0].coding, 'gzip');
  assert.equal(out[1].coding, 'br');
});
