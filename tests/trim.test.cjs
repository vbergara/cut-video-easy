const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../trim.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('requested flow preserves safe duration when moved and trimmed', () => {
  let range = T.length(0, T.presetDuration(15), 60);
  close(range[1] - range[0], 14.9);
  range = T.move(...range, 20, 60);
  close(range[0], 20); close(range[1], 34.9);
  range = T.edge(...range, range[0] + 5, 'start', 60);
  close(range[1] - range[0], 9.9);
  range = T.edge(...range, 38, 'end', 60);
  close(range[1] - range[0], 13);
});
test('moving against either boundary preserves duration', () => {
  assert.deepEqual(T.move(10, 20, -50, 60), [0, 10]);
  assert.deepEqual(T.move(10, 20, 100, 60), [50, 60]);
});
test('edges cannot cross or escape the source', () => {
  assert.deepEqual(T.edge(10, 20, -9, 'start', 60), [0, 20]);
  close(T.edge(10, 20, 80, 'start', 60)[0], 19.9);
  close(T.edge(10, 20, 0, 'end', 60)[1], 10.1);
  assert.deepEqual(T.edge(10, 20, 90, 'end', 60), [10, 60]);
});
test('presets fit short sources and move back from the end', () => {
  assert.deepEqual(T.length(0, 14.9, 3), [0, 3]);
  assert.deepEqual(T.length(58, 10, 60), [50, 60]);
  assert.deepEqual(T.length(0, 5, .05), [0, .05]);
  close(T.presetDuration(5), 5); close(T.presetDuration(10), 10);
});
