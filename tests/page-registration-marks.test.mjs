import assert from 'node:assert/strict';
import test from 'node:test';
import cvReady from '@techstark/opencv-js';
import { findPageRegistrationMarks } from '../src/services/pageRegistrationMarks.mjs';

const cv = await cvReady;
const squareOrigins = [[34, 21], [555, 22], [36, 857], [554, 858]];

function makePage(t, origins) {
  const mat = new cv.Mat(900, 600, cv.CV_8UC1, new cv.Scalar(255));
  t.after(() => mat.delete());
  for (const [x, y] of origins) {
    cv.rectangle(mat, new cv.Point(x, y), new cv.Point(x + 13, y + 13), new cv.Scalar(30), -1);
  }
  return mat;
}

test('finds four registration squares despite nearby barcode strokes and an outlined bubble', t => {
  const page = makePage(t, squareOrigins);
  cv.rectangle(page, new cv.Point(536, 10), new cv.Point(539, 31), new cv.Scalar(10), -1);
  cv.circle(page, new cv.Point(15, 53), 8, new cv.Scalar(20), 1);
  assert.deepEqual(findPageRegistrationMarks(cv, page), squareOrigins.map(([x, y]) => [x + 6.5, y + 6.5]));
});

test('rejects missing, ambiguous and clipped corner marks', t => {
  assert.equal(findPageRegistrationMarks(cv, makePage(t, squareOrigins.slice(0, 3))), null);
  assert.equal(findPageRegistrationMarks(cv, makePage(t, [...squareOrigins, [20, 60]])), null);
  assert.equal(findPageRegistrationMarks(cv, makePage(t, [[0, 21], ...squareOrigins.slice(1)])), null);
});
