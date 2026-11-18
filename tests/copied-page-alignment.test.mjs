import assert from 'node:assert/strict';
import test from 'node:test';
import cvReady from '@techstark/opencv-js';
import { fitCopiedPageAlignment } from '../src/services/copiedPageAlignment.mjs';

const cv = await cvReady;
const templateMarks = [[138, 140], [2340, 140], [138, 3360], [2340, 3360]];
const transform = ([x, y]) => [0.94 * x + 13, 0.94 * y + 39];
const sourceMarks = templateMarks.map(transform);
const lattices = [191, 783, 1374, 1964].flatMap(xstart => [307, 1339, 2373].map(ystart => ({
  xstart, ystart, xstep: 95, ystep: 94.555555, cols: 5, rows: 10
})));
const points = lattices.flatMap(lattice => Array.from({ length: lattice.rows * lattice.cols }, (_, index) => [
  lattice.xstart + index % lattice.cols * lattice.xstep,
  lattice.ystart + Math.floor(index / lattice.cols) * lattice.ystep
]));
const options = { mat: { rows: 3508 }, templateMarks, sourceMarks, lattices };

test('copied-page alignment uses partial bubbles spread across the sheet to validate the corner estimate', () => {
  const circles = points.filter((_, index) => index % 4 !== 0).map((point, index) => {
    const [x, y] = transform(point);
    return [x + (index % 3 - 1) * 0.4, y + (index % 5 - 2) * 0.2];
  });
  const fit = fitCopiedPageAlignment(cv, { ...options, circles });
  assert.ok(fit);
  for (const [x, y] of templateMarks) {
    const matrix = fit.matrix;
    const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
    const mapped = [(matrix[0] * x + matrix[1] * y + matrix[2]) / divisor,
      (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor];
    const expected = transform([x, y]);
    assert.ok(Math.hypot(mapped[0] - expected[0], mapped[1] - expected[1]) < 1);
  }
});

test('copied-page alignment tolerates a small corner-seed skew corroborated by the bubbles', () => {
  const skewedMarks = sourceMarks.map(point => [...point]);
  skewedMarks[0][0] += 10.5;
  const fit = fitCopiedPageAlignment(cv, {
    ...options, sourceMarks: skewedMarks, circles: points.map(transform)
  });
  assert.ok(fit);
  const matrix = fit.matrix;
  for (const [x, y] of templateMarks) {
    const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
    const actual = [(matrix[0] * x + matrix[1] * y + matrix[2]) / divisor,
      (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor];
    const expected = transform([x, y]);
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1);
  }

  skewedMarks[0][0] += 20;
  assert.equal(fitCopiedPageAlignment(cv, {
    ...options, sourceMarks: skewedMarks, circles: points.map(transform)
  }), null);
});

test('copied-page alignment rejects too few, localized, shifted and inconsistent bubble matches', () => {
  assert.equal(fitCopiedPageAlignment(cv, { ...options, circles: points.slice(0, 59).map(transform) }), null);
  assert.equal(fitCopiedPageAlignment(cv, { ...options, circles: points.slice(0, 100).map(transform) }), null);
  assert.equal(fitCopiedPageAlignment(cv, {
    ...options, circles: points.map(point => transform([point[0] + 30, point[1]]))
  }), null);
  const circles = points.map((point, index) => {
    const [x, y] = transform(point);
    const angle = index * 2.399963;
    return [x + Math.cos(angle) * 9, y + Math.sin(angle) * 9];
  });
  assert.equal(fitCopiedPageAlignment(cv, { ...options, circles }), null);
});

test('copied-page alignment rejects two distant grids that leave the other quadrants unsupported', () => {
  const circles = [...points.slice(0, 50), ...points.slice(550, 600)].map(transform);
  assert.equal(fitCopiedPageAlignment(cv, { ...options, circles }), null);
});
