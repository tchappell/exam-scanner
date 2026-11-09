// These are the same template coordinates used by the recognition lattices.
// Saved matrices map a template-region point to the original PDF bitmap at 4x.
export const COMPARISON_TEMPLATE_SIZE = Object.freeze({ width: 2479, height: 3508 });
const SCAN_RENDER_SCALE = 4;
const COLUMN_STARTS = [191, 783, 1374, 1964];
const REVERSE_ROW_STARTS = [307, 1339, 2373];
const ANSWER_ROW_STEP = 94.555555;
const IDENTITY_RECTS = {
  // Include the handwritten boxes above the bubbles, not just the bubble grid.
  studentNum: { x: 672, y: 288, width: 600, height: 810 },
  surname: { x: 1262, y: 288, width: 890, height: 1980 },
  initials: { x: 2152, y: 288, width: 250, height: 1840 }
};

export function comparisonCropRegion(diff) {
  if (!diff) return null;
  if (Object.hasOwn(IDENTITY_RECTS, diff.field)) {
    const rect = { ...IDENTITY_RECTS[diff.field] };
    return {
      side: 0,
      rect,
      anchor: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    };
  }
  if (diff.field !== 'answers' || !Number.isInteger(diff.idx) || diff.idx < 0 || diff.idx >= 160) return null;

  const side = diff.idx < 40 ? 0 : 1;
  const localQuestion = side === 0 ? diff.idx : diff.idx - 40;
  const block = Math.floor(localQuestion / 10);
  const column = side === 0 ? block : Math.floor(block / 3);
  const rowStart = side === 0 ? 2361 : REVERSE_ROW_STARTS[block % 3];
  const anchor = {
    x: COLUMN_STARTS[column] + 190,
    y: Math.floor(rowStart + (localQuestion % 10) * ANSWER_ROW_STEP)
  };
  return {
    side,
    anchor,
    rect: { x: anchor.x - 380, y: anchor.y - 80, width: 760, height: 160 }
  };
}

function validHomography(value) {
  return value && ['rect_x', 'rect_y', 'rect_w', 'rect_h'].every(field => Number.isFinite(value[field]))
    && value.rect_w > 0 && value.rect_h > 0
    && Array.isArray(value.matrix) && value.matrix.length === 9 && value.matrix.every(Number.isFinite);
}

function mappedBounds(region, homography, width, height, scale) {
  const { x, y, width: cropWidth, height: cropHeight } = region.rect;
  const corners = [[x, y], [x + cropWidth, y], [x + cropWidth, y + cropHeight], [x, y + cropHeight]];
  const matrix = homography.matrix;
  const denominators = corners.map(([cornerX, cornerY]) =>
    matrix[6] * (cornerX - homography.rect_x) + matrix[7] * (cornerY - homography.rect_y) + matrix[8]);
  // A denominator that crosses zero would project part of this crop to infinity.
  if (denominators.some(value => !Number.isFinite(value) || Math.abs(value) < 1e-9)
      || denominators.some(value => Math.sign(value) !== Math.sign(denominators[0]))) return null;

  const points = corners.map(([cornerX, cornerY], index) => {
    const localX = cornerX - homography.rect_x;
    const localY = cornerY - homography.rect_y;
    return [
      (matrix[0] * localX + matrix[1] * localY + matrix[2]) / denominators[index] * scale / SCAN_RENDER_SCALE,
      (matrix[3] * localX + matrix[4] * localY + matrix[5]) / denominators[index] * scale / SCAN_RENDER_SCALE
    ];
  });
  if (points.some(point => point.some(value => !Number.isFinite(value)))) return null;

  const left = Math.max(0, Math.floor(Math.min(...points.map(point => point[0]))));
  const top = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
  const right = Math.min(Math.floor(width), Math.ceil(Math.max(...points.map(point => point[0]))));
  const bottom = Math.min(Math.floor(height), Math.ceil(Math.max(...points.map(point => point[1]))));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** Return the source-page pixel bounds for a difference, without recognizing it again. */
export function mapComparisonCrop(diff, homographies, { width, height, scale = 2 } = {}) {
  const region = comparisonCropRegion(diff);
  if (!region || ![width, height, scale].every(value => Number.isFinite(value) && value > 0)
      || !Array.isArray(homographies)) return null;
  const candidates = homographies.filter(value => validHomography(value)
    && region.anchor.x >= value.rect_x && region.anchor.x < value.rect_x + value.rect_w
    && region.anchor.y >= value.rect_y && region.anchor.y < value.rect_y + value.rect_h)
    .sort((left, right) => left.rect_w * left.rect_h - right.rect_w * right.rect_h);
  for (const homography of candidates) {
    // The handwritten area or contextual margin can extend beyond the lattice.
    // Extrapolate with its own matrix rather than switching to an adjacent field.
    const bounds = mappedBounds(region, homography, width, height, scale);
    if (bounds) return bounds;
  }
  return null;
}
