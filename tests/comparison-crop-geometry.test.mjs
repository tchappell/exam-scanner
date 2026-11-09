import assert from 'node:assert/strict';
import test from 'node:test';

import { comparisonCropRegion, mapComparisonCrop } from '../src/services/comparisonCropGeometry.mjs';

const wholeTemplate = matrix => ({ rect_x: 0, rect_y: 0, rect_w: 2479, rect_h: 3508, matrix });
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const size = { width: 2479, height: 3508, scale: 4 };

test('answer crops select the right question row and side across both sheet layouts', () => {
  assert.deepEqual(comparisonCropRegion({ field: 'answers', idx: 0 }), {
    side: 0, anchor: { x: 381, y: 2361 }, rect: { x: 1, y: 2281, width: 760, height: 160 }
  });
  assert.deepEqual(comparisonCropRegion({ field: 'answers', idx: 39 }), {
    side: 0, anchor: { x: 2154, y: 3211 }, rect: { x: 1774, y: 3131, width: 760, height: 160 }
  });
  for (const [idx, x, y] of [[40, 381, 307], [50, 381, 1339], [70, 973, 307], [100, 1564, 307], [159, 2154, 3223]]) {
    assert.deepEqual(comparisonCropRegion({ field: 'answers', idx }).anchor, { x, y });
    assert.equal(comparisonCropRegion({ field: 'answers', idx }).side, 1);
  }
});

test('all student-detail crops include handwritten boxes as well as their complete bubble grids', () => {
  for (const [field, finalBubbleX, finalBubbleY] of [
    ['studentNum', 1219, 1033], ['surname', 2093, 2204], ['initials', 2344, 2073]
  ]) {
    const { side, rect } = comparisonCropRegion({ field });
    assert.equal(side, 0);
    assert.ok(rect.y < 448 - 146);
    assert.ok(rect.x + rect.width > finalBubbleX);
    assert.ok(rect.y + rect.height > finalBubbleY);
  }
});

test('saved local-coordinate homographies map crops to the current PDF render scale', () => {
  const homography = { rect_x: 100, rect_y: 2200, rect_w: 600, rect_h: 1100,
    matrix: [1, 0, 100, 0, 1, 2200, 0, 0, 1] };
  assert.deepEqual(mapComparisonCrop({ field: 'answers', idx: 0 }, [homography], {
    width: 1240, height: 1754, scale: 2
  }), { x: 0, y: 1140, width: 381, height: 81 });
});

test('mapping uses one field matrix for all corners even when the context extends into a neighboring field', () => {
  const unrelated = { rect_x: 0, rect_y: 2200, rect_w: 200, rect_h: 1100,
    matrix: [1, 0, 2000, 0, 1, 2200, 0, 0, 1] };
  const matching = { rect_x: 100, rect_y: 2200, rect_w: 600, rect_h: 1100,
    matrix: [1, 0, 100, 0, 1, 2200, 0, 0, 1] };
  assert.deepEqual(mapComparisonCrop({ field: 'answers', idx: 0 }, [unrelated, matching], size),
    { x: 1, y: 2281, width: 760, height: 160 });
  assert.equal(mapComparisonCrop({ field: 'answers', idx: 0 }, [unrelated], size), null);
});

test('rotated and perspective-mapped crops enclose all four transformed corners', () => {
  assert.deepEqual(mapComparisonCrop({ field: 'answers', idx: 0 }, [wholeTemplate([
    0, -1, 3508, 1, 0, 0, 0, 0, 1
  ])], { width: 3508, height: 2479, scale: 4 }), { x: 1067, y: 1, width: 160, height: 760 });

  const perspective = [1, 0.03, 5, 0.02, 1, 7, 0.00001, 0.00002, 1];
  const bounds = mapComparisonCrop({ field: 'studentNum' }, [wholeTemplate(perspective)], size);
  const { rect } = comparisonCropRegion({ field: 'studentNum' });
  for (const [x, y] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]) {
    const denominator = perspective[6] * x + perspective[7] * y + 1;
    const px = (x + 0.03 * y + 5) / denominator;
    const py = (0.02 * x + y + 7) / denominator;
    assert.ok(px >= bounds.x && px <= bounds.x + bounds.width);
    assert.ok(py >= bounds.y && py <= bounds.y + bounds.height);
  }
});

test('crops are clipped to the source page instead of reading past its edges', () => {
  assert.deepEqual(mapComparisonCrop({ field: 'answers', idx: 39 }, [wholeTemplate(identity)], size),
    { x: 1774, y: 3131, width: 705, height: 160 });
  assert.equal(mapComparisonCrop({ field: 'answers', idx: 0 }, [wholeTemplate(identity)], {
    width: 100, height: 100, scale: 4
  }), null);
});

test('missing, corrupt, and singular alignment matrices return no crop without falling back to another field', () => {
  const diff = { field: 'answers', idx: 0 };
  for (const homographies of [undefined, [], [wholeTemplate([1])], [wholeTemplate(identity.map(() => NaN))],
    [wholeTemplate([0, 0, 0, 0, 0, 0, 0, 0, 1])], [wholeTemplate([1, 0, 0, 0, 1, 0, 0, 1, -2361])]]) {
    assert.equal(mapComparisonCrop(diff, homographies, size), null);
  }
  for (const idx of [-1, 160, 0.5, '1']) assert.equal(comparisonCropRegion({ field: 'answers', idx }), null);
  assert.equal(comparisonCropRegion({ field: 'unrecognised' }), null);
  assert.equal(mapComparisonCrop(diff, [wholeTemplate(identity)], { ...size, scale: 0 }), null);
});
