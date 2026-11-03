import assert from 'node:assert/strict';
import test from 'node:test';
import { splitContent, truncate } from '../src/relay/text.js';

test('truncate preserves short strings', () => {
  assert.equal(truncate('hello', 10), 'hello');
});

test('truncate adds an ellipsis', () => {
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
});

test('splitContent keeps every chunk at or below the limit', () => {
  const input = Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n');
  const chunks = splitContent(input, 200);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.equal(chunks.join('\n').replaceAll('\n', ' ').replaceAll(/\s+/g, ' ').trim(), input.replaceAll('\n', ' ').replaceAll(/\s+/g, ' ').trim());
});

test('splitContent preserves surrogate pairs', () => {
  const chunks = splitContent('a'.repeat(1995) + '😀'.repeat(100));
  assert.ok(chunks.every(c => !/[\uD800-\uDBFF]$/.test(c) && !/^[\uDC00-\uDFFF]/.test(c)));
  assert.equal(chunks.join(''), 'a'.repeat(1995) + '😀'.repeat(100));
});
test('splitContent closes and reopens fenced code blocks', () => {
  const chunks = splitContent('```js\n' + 'console.log(1);\n'.repeat(300) + '```');
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 2000 && (c.match(/```/g)?.length ?? 0) % 2 === 0));
});
