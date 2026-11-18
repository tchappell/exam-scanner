function project(matrix, [x, y]) {
  const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-9) return null;
  const point = [(matrix[0] * x + matrix[1] * y + matrix[2]) / divisor,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor];
  return point.every(Number.isFinite) ? point : null;
}

function latticePoints(lattices) {
  return lattices.flatMap(lattice => Array.from({ length: lattice.rows }, (_, row) =>
    Array.from({ length: lattice.cols }, (_, column) => [
      lattice.xstart + column * lattice.xstep,
      lattice.ystart + row * lattice.ystep
    ])).flat());
}

function matchCircles(points, circles, seed, radius) {
  const candidates = [];
  for (const point of points) {
    const expected = project(seed, point);
    if (!expected) continue;
    let closest = -1;
    let distance = radius * radius;
    for (let index = 0; index < circles.length; index++) {
      const circle = circles[index];
      const squared = (circle[0] - expected[0]) ** 2 + (circle[1] - expected[1]) ** 2;
      if (squared >= distance) continue;
      closest = index;
      distance = squared;
    }
    if (closest >= 0) candidates.push({ point, circle: closest, distance });
  }
  candidates.sort((left, right) => left.distance - right.distance);
  const used = new Set();
  return candidates.filter(candidate => {
    if (used.has(candidate.circle)) return false;
    used.add(candidate.circle);
    return true;
  });
}

function bounds(points) {
  return {
    left: Math.min(...points.map(point => point[0])),
    right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])),
    bottom: Math.max(...points.map(point => point[1]))
  };
}

/** Refine the four-corner estimate only when detected bubbles corroborate it across the page. */
export function fitCopiedPageAlignment(cv, { mat, templateMarks, sourceMarks, circles, lattices }) {
  if (templateMarks?.length !== 4 || sourceMarks?.length !== 4 || circles.length < 60) return null;
  const allocated = [];
  const keep = matrix => {
    allocated.push(matrix);
    return matrix;
  };
  try {
    const corners = keep(cv.matFromArray(4, 1, cv.CV_32FC2, templateMarks.flat()));
    const scannedCorners = keep(cv.matFromArray(4, 1, cv.CV_32FC2, sourceMarks.flat()));
    const seedMatrix = keep(cv.getPerspectiveTransform(corners, scannedCorners));
    const seed = Array.from(seedMatrix.data64F);
    if (seed.length !== 9 || !seed.every(Number.isFinite)) return null;

    const points = latticePoints(lattices);
    const scale = mat.rows / 3508;
    const radius = 10 * scale;
    const matches = matchCircles(points, circles, seed, radius);
    if (matches.length < 60) return null;
    const templatePoints = keep(cv.matFromArray(matches.length, 1, cv.CV_32FC2, matches.flatMap(match => match.point)));
    const sourcePoints = keep(cv.matFromArray(matches.length, 1, cv.CV_32FC2, matches.flatMap(match => circles[match.circle].slice(0, 2))));
    const inliers = keep(new cv.Mat());
    const forward = keep(cv.findHomography(sourcePoints, templatePoints, cv.RANSAC, 4, inliers));
    if (forward.data64F.length !== 9 || !forward.data64F.every(Number.isFinite)) return null;
    const confirmed = matches.filter((_, index) => inliers.data[index]);
    if (confirmed.length < 60 || confirmed.length < matches.length * 0.6) return null;

    const layout = bounds(points);
    const coverage = bounds(confirmed.map(match => match.point));
    if (coverage.right - coverage.left < (layout.right - layout.left) * 0.6
      || coverage.bottom - coverage.top < (layout.bottom - layout.top) * 0.6) return null;
    const midX = (layout.left + layout.right) / 2;
    const midY = (layout.top + layout.bottom) / 2;
    const quadrants = [0, 0, 0, 0];
    for (const { point: [x, y] } of confirmed) quadrants[(x >= midX ? 1 : 0) + (y >= midY ? 2 : 0)]++;
    if (quadrants.some(count => count < 5)) return null;

    const inverse = keep(new cv.Mat());
    if (!cv.invert(forward, inverse, cv.DECOMP_LU)) return null;
    const matrix = Array.from(inverse.data64F);
    if (matrix.length !== 9 || !matrix.every(Number.isFinite)) return null;
    // Bound the refinement across every grid, including grids with faint or missing
    // rings. Allow slightly more extrapolation at the outer registration squares.
    for (const [checkPoints, maxDrift] of [[templateMarks, 20 * scale], [points, 15 * scale]]) {
      for (const point of checkPoints) {
        const expected = project(seed, point);
        const refined = project(matrix, point);
        if (!expected || !refined || Math.hypot(refined[0] - expected[0], refined[1] - expected[1]) > maxDrift) return null;
      }
    }
    return { matrix };
  } finally {
    for (const matrix of allocated) matrix.delete();
  }
}
