import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClassification } from '../src/middleware/classify.ts';

function req(headers: Record<string, string>): Request {
  return new Request('https://x/', { method: 'POST', headers });
}

test('returns null when header is missing', () => {
  assert.equal(extractClassification(req({}), {}), null);
});

test('returns null for invalid classification value', () => {
  assert.equal(extractClassification(req({ 'X-Data-Classification': 'topsecret' }), {}), null);
});

test('returns null when body classification does not match header', () => {
  assert.equal(
    extractClassification(req({ 'X-Data-Classification': 'cui' }), { data_classification: 'phi' }),
    null,
  );
});

test('accepts valid matching classification', () => {
  assert.equal(extractClassification(req({ 'X-Data-Classification': 'cui' }), { data_classification: 'cui' }), 'cui');
  assert.equal(extractClassification(req({ 'X-Data-Classification': 'phi' }), {}), 'phi');
});
