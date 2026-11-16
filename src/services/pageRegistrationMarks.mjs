function findCornerMark(cv, mat, rect, minSize, maxSize) {
  const region = mat.roi(rect);
  const dark = new cv.Mat();
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  try {
    cv.threshold(region, dark, 128, 255, cv.THRESH_BINARY_INV);
    const labelCount = cv.connectedComponentsWithStats(dark, labels, stats, centroids, 8, cv.CV_32S);
    const components = stats.data32S;
    const centers = centroids.data64F;
    let mark = null;
    for (let label = 1; label < labelCount; label++) {
      const offset = label * stats.cols;
      const left = components[offset + cv.CC_STAT_LEFT];
      const top = components[offset + cv.CC_STAT_TOP];
      const width = components[offset + cv.CC_STAT_WIDTH];
      const height = components[offset + cv.CC_STAT_HEIGHT];
      const area = components[offset + cv.CC_STAT_AREA];
      if (width < minSize || height < minSize || width > maxSize || height > maxSize) continue;
      if (width / height < 0.8 || width / height > 1.25 || area < width * height * 0.8) continue;
      if (left === 0 || top === 0 || left + width === rect.width || top + height === rect.height) continue;
      if (mark) return null;
      mark = [rect.x + centers[label * 2], rect.y + centers[label * 2 + 1]];
    }
    return mark;
  } finally {
    region.delete();
    dark.delete();
    labels.delete();
    stats.delete();
    centroids.delete();
  }
}

/** Find the four printed alignment squares in reading order. */
export function findPageRegistrationMarks(cv, mat) {
  const width = Math.floor(mat.cols * 0.12);
  const height = Math.floor(mat.rows * 0.10);
  const minSize = Math.ceil(mat.rows * 0.010);
  const maxSize = Math.floor(mat.rows * 0.023);
  if (minSize < 3 || width <= minSize || height <= minSize) return null;

  const right = mat.cols - width;
  const bottom = mat.rows - height;
  const marks = [];
  for (const [x, y] of [[0, 0], [right, 0], [0, bottom], [right, bottom]]) {
    const mark = findCornerMark(cv, mat, new cv.Rect(x, y, width, height), minSize, maxSize);
    if (!mark) return null;
    marks.push(mark);
  }
  return marks;
}
