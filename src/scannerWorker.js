import cvReadyPromise from "@techstark/opencv-js";
import predictor from './predictor2';

const ORB_FEATURES = 500;
const ORB_RETRY_FEATURES = 1500;

function grayMatFromBitmap(cv, bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let original;
  try {
    ctx.drawImage(bitmap, 0, 0);
    original = cv.matFromImageData(ctx.getImageData(0, 0, bitmap.width, bitmap.height));
    const gray = new cv.Mat();
    try {
      cv.cvtColor(original, gray, cv.COLOR_BGR2GRAY);
      return gray;
    } catch (error) {
      gray.delete();
      throw error;
    }
  } finally {
    original?.delete();
    canvas.width = 0;
    canvas.height = 0;
    bitmap.close();
  }
}

const loadTemplateImages = async () => {
  const templatePaths = [
    "../page1.png", "../page2.png"
  ];
  const templateImages = [];

  for (const templatePath of templatePaths) {
    const res = await fetch(templatePath, { mode: 'cors' });
    const blob = await res.blob();
    const cv = await cvReadyPromise;
    const mat = grayMatFromBitmap(cv, await createImageBitmap(blob));

    templateImages.push({ mat, ...detectOrbFeatures(cv, mat, ORB_FEATURES) });
  }
  return templateImages;
};

const loadPredict = async (path) => {
  const cv = await cvReadyPromise;
  return await predictor(path, cv);
};

const loadImage = async (path) => {
  const res = await fetch(path, { mode: 'cors' });
  const blob = await res.blob();
  const cv = await cvReadyPromise;
  return grayMatFromBitmap(cv, await createImageBitmap(blob));
};

const templateImagesPromise = loadTemplateImages();
const bubblepredictPromise = loadPredict("../bubble-detector.json");
const abcdepredictPromise = loadPredict("../abcde-n-detector.json");
const letterpredictPromise = loadPredict("../letter-detector.json");
const digitpredictPromise = loadPredict("../digit-detector.json");
const num_mask_mat1Promise = loadImage("../num_mask_page1.png");
const num_mask_mat2Promise = loadImage("../num_mask_page2.png");

const initialize = async () => {
  await Promise.all([
    cvReadyPromise,
    templateImagesPromise,
    bubblepredictPromise,
    abcdepredictPromise,
    letterpredictPromise,
    digitpredictPromise,
    num_mask_mat1Promise,
    num_mask_mat2Promise
  ]);
  return [{ ready: true }, []];
};

/*
  Hough circle lattice notes

Centre: 56,56
Min X: 17 (-39)
Min Y: 19 (-37)
Max X: 96 (40)
Max Y: 94 (38)

Distance between circles- 92-96 or so apart

This means the safe window is about 86x86 (43,43)

Circles are 45x45 (this value seems very accurate)
Gaps in the student details area: hori 26.09091 and vert 20.09091
Gaps in the answers area: hori 50  vert: 49.777778

Real step values:
Student details:
Hori step: 71
Vert step: 65.0370
Answers:
Hori step: 95
Vert step: 94.55555555

Top left student num: 722,448
Surname: 1312,448 (bottom right circle calc'd as 2094,2205.45457, actually 2204)
Initials: 2202,448 (bottom right circle 2344,2074)

Q1A:  191,2361
Q11A: 783,2361
Q21A: 1374,2361
Q31A: 1964,2361
Q40E: 2344,3212 (95, 94.55555555)

Rows:
Q1    2361 
Q2    2455
Q3    2550
Q4    2645
Q5    2739
Q6    2834
Q7    2928
Q8    3023
Q9:   3118
Q10: ,3212

*/
const known_lattices = [[
  { xstart: 722, ystart: 448, cols: 8, rows: 10, xstep: 71, ystep: 65.037 }, // Student number
  { xstart: 1312, ystart: 448, cols: 12, rows: 28, xstep: 71, ystep: 65.037 }, // Surname
  { xstart: 2202, ystart: 448, cols: 3, rows: 26, xstep: 71, ystep: 65.037 }, // Initials
  { xstart: 191, ystart: 2361, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q1-10
  { xstart: 783, ystart: 2361, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q11-20
  { xstart: 1374, ystart: 2361, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q21-30
  { xstart: 1964, ystart: 2361, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q31-40
],[
  { xstart: 191, ystart: 307, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q41-Q50
  { xstart: 191, ystart: 1339, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q51-60
  { xstart: 191, ystart: 2373, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q61-70
  { xstart: 783, ystart: 307, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q71-Q80
  { xstart: 783, ystart: 1339, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q81-90
  { xstart: 783, ystart: 2373, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q91-100
  { xstart: 1374, ystart: 307, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q101-Q110
  { xstart: 1374, ystart: 1339, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q111-120
  { xstart: 1374, ystart: 2373, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q121-130
  { xstart: 1964, ystart: 307, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q131-140
  { xstart: 1964, ystart: 1339, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q141-150
  { xstart: 1964, ystart: 2373, cols: 5, rows: 10, xstep: 95, ystep: 94.555555 }, // Q151-160
]];
const transformPoint = (pt, H) => {
  const [x, y] = pt;

  const xPrime = H[0] * x + H[1] * y + H[2];
  const yPrime = H[3] * x + H[4] * y + H[5];
  const wPrime = H[6] * x + H[7] * y + H[8];

  // Guard against division by zero (point mapped to infinity)
  if (wPrime === 0) {
    return [Infinity, Infinity];
  }

  return [xPrime / wPrime, yPrime / wPrime];
}

class PageAlignmentError extends Error {}

function fitAlignment(cv, sourcePoints, templatePoints, inliers, label) {
  const count = sourcePoints.length / 2;
  if (count < 4) throw new PageAlignmentError(`Too few matches for ${label}.`);
  const source = cv.matFromArray(count, 1, cv.CV_32FC2, sourcePoints);
  const target = cv.matFromArray(count, 1, cv.CV_32FC2, templatePoints);
  try {
    const matrix = cv.findHomography(source, target, cv.RANSAC, 3, inliers);
    if (matrix.data64F.length === 9 && matrix.data64F.every(Number.isFinite)) return matrix;
    matrix.delete();
    throw new PageAlignmentError(`Could not fit a transform for ${label}.`);
  } finally {
    source.delete();
    target.delete();
  }
}

function invertAlignment(cv, matrix, inverse, label) {
  if (!cv.invert(matrix, inverse, cv.DECOMP_LU)
    || inverse.data64F.length !== 9 || !inverse.data64F.every(Number.isFinite)) {
    throw new PageAlignmentError(`Could not invert the transform for ${label}.`);
  }
  return Array.from(inverse.data64F);
}

function requireMatchCoverage(points, inliers, minCount, minWidth, minHeight, label) {
  const inlierFlags = inliers.data;
  let count = 0;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let index = 0; index < inlierFlags.length; index++) {
    if (!inlierFlags[index]) continue;
    const x = points[index * 2];
    const y = points[index * 2 + 1];
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    count++;
  }
  if (count < minCount || right - left < minWidth || bottom - top < minHeight) {
    throw new PageAlignmentError(`Matches did not cover enough of ${label}.`);
  }
}

function detectOrbFeatures(cv, mat, featureCount) {
  const orb = new cv.ORB(featureCount);
  const kp = new cv.KeyPointVector();
  const des = new cv.Mat();
  const mask = new cv.Mat();
  try {
    orb.detectAndCompute(mat, mask, kp, des);
    return { kp, des };
  } catch (error) {
    kp.delete();
    des.delete();
    throw error;
  } finally {
    orb.delete();
    mask.delete();
  }
}

function estimatePageAlignment(cv, mat, template, inverse, inliers, retry) {
  const featureCount = retry ? ORB_RETRY_FEATURES : ORB_FEATURES;
  if (retry) template.retryFeatures ??= detectOrbFeatures(cv, template.mat, featureCount);
  const reference = retry ? template.retryFeatures : template;
  const { kp, des } = detectOrbFeatures(cv, mat, featureCount);
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const matches = new cv.DMatchVectorVector();
  const targetPoints = [], sourcePoints = [];
  try {
    matcher.knnMatch(reference.des, des, matches, 2);
    for (let i = 0; i < matches.size(); i++) {
      const candidates = matches.get(i);
      try {
        if (candidates.size() < 2) continue;
        const first = candidates.get(0);
        const second = candidates.get(1);
        if (first.distance >= 0.75 * second.distance) continue;
        const target = reference.kp.get(first.queryIdx).pt;
        const source = kp.get(first.trainIdx).pt;
        targetPoints.push(target.x, target.y);
        sourcePoints.push(source.x, source.y);
      } finally {
        candidates.delete();
      }
    }
    const matrix = fitAlignment(cv, sourcePoints, targetPoints, inliers, 'the page');
    try {
      if (retry) requireMatchCoverage(targetPoints, inliers, 12, template.mat.cols / 4, template.mat.rows / 4, 'the page');
      return invertAlignment(cv, matrix, inverse, 'the page');
    } finally {
      matrix.delete();
    }
  } finally {
    matcher.delete();
    matches.delete();
    kp.delete();
    des.delete();
  }
}

function alignAnswerGrids(cv, mat, template, templatePage, circles, pdfScale, matOut, retry) {
  const inverse = new cv.Mat();
  const inlierMask = new cv.Mat();
  const homographies = [];
  const pts1 = [], pts2 = [];
  try {
    const invH = estimatePageAlignment(cv, mat, template, inverse, inlierMask, retry);
    const sqrSearchRadius = Math.pow(25 * pdfScale, 2);
    let next_global_drift_x = 0, next_global_drift_y = 0;
    for (let li = 0; li < known_lattices[templatePage].length; li++) {
      const global_drift_x = next_global_drift_x;
      const global_drift_y = next_global_drift_y;
      next_global_drift_x = 0;
      next_global_drift_y = 0;

      pts1.length = 0; pts2.length = 0;

      const lattice = known_lattices[templatePage][li];
      let rect_x = lattice.xstart - 30;
      let rect_y = lattice.ystart - 30;
      let rect_w = Math.floor(lattice.xstep * (lattice.cols - 1)) + 60;
      let rect_h = Math.floor(lattice.ystep * (lattice.rows - 1)) + 60;

      if (templatePage === 0) {
        if (li < 3) {
          // Add 180 to the top, to include letter fields and label
          rect_y -= 180;
          rect_h += 180;

          // If this is the student number box, add 800 to the bottom to get unit, signature, date
          if (li === 0) {
            rect_h += 800;
          }
        } else {
          // Add 60 to the top, 50 to the bottom
          rect_y -= 60;
          rect_h += 60 + 50;

          // 80 to the left and 70 to the right
          rect_x -= 80;
          rect_w += 80 + 70;

          // If this is the leftmost box, stretch it out to the left edge
          if (li === 3) {
            rect_w += rect_x;
            rect_x = 0;
          }
          // If this is the rightmost box, stretch it out to the right edge
          if (li === 6) {
            const add = 2479 - rect_w - rect_x;
            rect_w += add;
          }
        }
      } else {
        // Add 60 to the top, 50 to the bottom
        rect_y -= 60;
        rect_h += 60 + 50;

        // 80 to the left and 70 to the right
        rect_x -= 80;
        rect_w += 80 + 70;

        // If this is a left box, stretch it out to the left edge
        if (li < 3) {
          rect_w += rect_x;
          rect_x = 0;
        }
        // If this is a right box, stretch it out to the right edge
        if (li >= 9) {
          const add = 2479 - rect_w - rect_x;
          rect_w += add;
        }
      }

      let { xstart, ystart } = lattice;
      let y = ystart;
      let xoffset_outer = global_drift_x;
      let yoffset_outer = global_drift_y;

      for (let row = 0; row < lattice.rows; row++) {
        let x = xstart;
        let xoffset_inner = 0;
        let yoffset_inner = 0;

        for (let col = 0; col < lattice.cols; col++) {
          // Search for circle within threshold radius, take closest
          let closest_circle = null;
          let closest_dist = Infinity;
          let [xts, yts] = transformPoint([x, y], invH);
          xts += xoffset_outer + xoffset_inner;
          yts += yoffset_outer + yoffset_inner;

          for (const circle of circles) {
            let sqrdist = Math.pow(xts - circle[0], 2) +
              Math.pow(yts - circle[1], 2);
            if (sqrdist < closest_dist) {
              closest_dist = sqrdist;
              closest_circle = circle;
            }
          }
          if (closest_dist < sqrSearchRadius) {
            // Set offset to match circle
            if (col === 0) {
              xoffset_outer += closest_circle[0] - xts;
              yoffset_outer += closest_circle[1] - yts;
            } else {
              xoffset_inner += closest_circle[0] - xts;
              yoffset_inner += closest_circle[1] - yts;
            }
            // Add points
            pts1.push(x, y);
            pts2.push(closest_circle[0], closest_circle[1]);
          }
          x += lattice.xstep;

          // If this is the last column of the first row
          // and if the next lattice is horizontally to the right
          // set the next global drift here
          if (templatePage === 0) {
            if (row === 0 && col === lattice.cols - 1 && li !== 2 && li !== 6) {
              next_global_drift_x = xoffset_inner + xoffset_outer;
              next_global_drift_y = yoffset_inner + yoffset_outer;
            }
          } else {
            if (row === 0 && col === lattice.cols - 1 && li < 9) {
              next_global_drift_x = xoffset_inner + xoffset_outer;
              next_global_drift_y = yoffset_inner + yoffset_outer;
            }
          }
        }
        y += lattice.ystep;
      }

      const label = `answer-sheet grid ${li + 1}`;
      const gridMatrix = fitAlignment(cv, pts2, pts1, inlierMask, label);
      let corners;
      try {
        if (retry) {
          requireMatchCoverage(pts1, inlierMask, Math.ceil(lattice.cols * lattice.rows / 3),
            lattice.xstep * (lattice.cols - 1) / 2, lattice.ystep * (lattice.rows - 1) / 2, label);
        }
        const gridInverse = invertAlignment(cv, gridMatrix, inverse, label);
        corners = [transformPoint([rect_x, rect_y], gridInverse),
          transformPoint([rect_x + rect_w, rect_y + rect_h], gridInverse)];
      } finally {
        gridMatrix.delete();
      }
      let o_rect_x = Math.fround(corners[0][0]);
      let o_rect_y = Math.fround(corners[0][1]);
      let o_rect_w = Math.fround(corners[1][0]) - o_rect_x;
      let o_rect_h = Math.fround(corners[1][1]) - o_rect_y;

      const [prev_rect_x, prev_rect_y, prev_rect_w, prev_rect_h] = [rect_x, rect_y, rect_w, rect_h];
      if (o_rect_x < 0) {
        const scale = rect_w / o_rect_w;
        o_rect_w += o_rect_x; // o_rect_x is negative so this subtracts

        rect_w += o_rect_x * scale;
        rect_x -= o_rect_x * scale; // o_rect_x is negative so this adds
        o_rect_x = 0;
      }
      if (o_rect_y < 0) {
        const scale = rect_h / o_rect_h;
        o_rect_h += o_rect_y;
        rect_h += o_rect_y * scale;
        rect_y -= o_rect_y * scale;
        o_rect_y = 0;
      }
      if (o_rect_x + o_rect_w > mat.cols) {
        const scale = rect_w / o_rect_w;
        const over = o_rect_x + o_rect_w - mat.cols;
        o_rect_w -= over;
        rect_w -= over * scale;
      }
      if (o_rect_y + o_rect_h > mat.rows) {
        const scale = rect_h / o_rect_h;
        const over = o_rect_y + o_rect_h - mat.rows;
        o_rect_h -= over;
        rect_h -= over * scale;
      }

      if (![rect_x, rect_y, rect_w, rect_h].every(Number.isFinite)
        || o_rect_w <= 0 || o_rect_h <= 0 || rect_x < 0 || rect_y < 0 || rect_w < 1 || rect_h < 1
        || Math.trunc(rect_x) + Math.trunc(rect_w) > template.mat.cols
        || Math.trunc(rect_y) + Math.trunc(rect_h) > template.mat.rows) {
        throw new PageAlignmentError(`The mapped area for ${label} is outside the page.`);
      }
      for (let i = 0; i < pts1.length; i += 2) {
        pts1[i] -= rect_x;
        pts1[i + 1] -= rect_y;
      }
      const local = fitAlignment(cv, pts2, pts1, inlierMask, label);
      try {
        if (matOut) {
          const roi = matOut.roi(new cv.Rect(rect_x, rect_y, rect_w, rect_h));
          try {
            cv.warpPerspective(mat, roi, local, new cv.Size(rect_w, rect_h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
          } finally {
            roi.delete();
          }
        }
        homographies.push({
          rect_x: prev_rect_x,
          rect_y: prev_rect_y,
          rect_w: prev_rect_w,
          rect_h: prev_rect_h,
          matrix: invertAlignment(cv, local, inverse, label)
        });
      } finally {
        local.delete();
      }
    }
    return homographies;
  } finally {
    inverse.delete();
    inlierMask.delete();
  }
}

const warpPdfPageLinear = async (bmp, templatePage, matricesOnly = false) => {
  const cv = await cvReadyPromise;
  const template = (await templateImagesPromise)[templatePage];
  const mat = grayMatFromBitmap(cv, bmp);
  const blurred = new cv.Mat();
  const detected = new cv.Mat();
  try {
    const pdfScale = mat.rows / 3508;
    cv.GaussianBlur(mat, blurred, new cv.Size(5, 5), 0);
    cv.HoughCircles(blurred, detected, cv.HOUGH_GRADIENT, 1, 15, 40, 28, 18 * pdfScale, 27 * pdfScale);
    const circles = Array.from({ length: detected.cols }, (_, i) => [
      detected.data32F[i * 3], detected.data32F[i * 3 + 1]
    ]);
    const attempt = retry => {
      const matOut = matricesOnly ? null : template.mat.mat_clone();
      try {
        return [matOut, alignAnswerGrids(cv, mat, template, templatePage, circles, pdfScale, matOut, retry)];
      } catch (error) {
        matOut?.delete();
        throw error;
      }
    };
    try {
      return attempt(false);
    } catch (error) {
      if (!(error instanceof PageAlignmentError)) throw error;
      try {
        return attempt(true);
      } catch (retryError) {
        if (!(retryError instanceof PageAlignmentError)) throw retryError;
        const side = templatePage === 0 ? 'front-side' : 'reverse-side';
        throw new PageAlignmentError(`Could not align this PDF page with the ${side} answer-sheet template. ${retryError.message} Check the scan quality and page order.`);
      }
    }
  } finally {
    mat.delete();
    blurred.delete();
    detected.delete();
  }
};

const predict_answer_cas = (filled, ocrlist, anticheat = false, allowMultiple = false) => {
  const MIN_CROSSED_OCR = 1;
  const ocr = ocrlist.length > 0 ? ocrlist[0] : null;
  let filled_count = 0, crossed_count = 0, empty_count = 0;
  let raw = {
    filled_weights: filled.map(f => f.filled_weight),
    crossed_weights: filled.map(f => f.crossed_weight),
    empty_weights: filled.map(f => f.empty_weight),
    brightnesses: filled.map(f => f.brightness),
    probas: filled.map(f => f.proba),
    ocr
  };

  // Auto-mark any OCR as questionable
  if (ocr !== null) raw.questionable = true;

  for (let i = 0; i < filled.length; i++) {
    if (filled[i].crossed) crossed_count++;
    else if (filled[i].filled) filled_count++;
    else if (filled[i].empty) empty_count++;
  }
  // Make a single non-empty filled
  if (filled_count === 0 && empty_count === 1) {
    for (let i = 0; i < filled.length; i++) {
      if (!filled[i].empty && !filled[i].crossed) {
        filled[i].filled = true;
        filled_count++;
      }
    }
  }
  // All empty? Check brightness levels
  // <200, mark as filled (+ mark as questionable)
  // <220, mark as questionable
  if (filled_count === 0 && crossed_count === 0) {
    let q = false;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].brightness < 220) {
        raw.questionable = true;
      }
      if (filled[i].brightness < 200) {
        filled[i].filled = true;
        filled_count++;
      }
    }
    if (filled_count === 0) {
      return [' ', raw];
    }
  }

  // Multi-answer questions preserve every bubble classified as filled. Crossed
  // bubbles and handwritten corrections remain reviewable rather than being
  // silently folded into the selected set.
  if (allowMultiple && filled_count > 0) {
    const selected = filled
      .filter(choice => choice.filled && !choice.crossed)
      .map(choice => choice.key)
      .join('');
    if (crossed_count > 0 || ocr !== null) raw.questionable = true;
    if (selected !== '') return [selected, raw];
  }

  // If there's one answer and nothing crossed, return it
  if (filled_count === 1 && crossed_count === 0) {
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].filled && !filled[i].crossed) return [filled[i].key, raw];
    }
    throw new Error("This shouldn't happen");
  }
  // If there's one answer and ocr matches answer, return it
  if (filled_count === 1 && ocr) {
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].filled && !filled[i].crossed && filled[i].key === ocr) return [filled[i].key, raw];
    }
  }
  // If there's one answer and no ocr, return it
  if (filled_count === 1 && !ocr) {
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].filled && !filled[i].crossed) return [filled[i].key, raw];
    }
    throw new Error("This shouldn't happen");
  }

  // If there's more than one answer, check anticheat
  if (filled_count > 1) {
    // Mark as questionable either way
    raw.questionable = true;
    if (anticheat) {
      // Is one substantially darker? If so, might be false positive
      const BRIGHTNESS_GAP = 50;
      // Otherwise, is it more filled_weight?
      const FILLED_GAP = 0.0000001;

      for (let i = 0; i < filled.length; i++) {
        if (filled[i].filled) {
          let bcheck_count = 1;
          let fcheck_count = 1;
          for (let j = 0; j < filled.length; j++) {
            if (i === j) continue;
            if (!filled[j].filled) continue;
            if (filled[j].brightness - filled[i].brightness > BRIGHTNESS_GAP) {
              bcheck_count++;
            }
            if (filled[i].filled_weight - filled[j].filled_weight > FILLED_GAP) {
              fcheck_count++;
            }
          }
          if (Math.max(bcheck_count, fcheck_count) === filled_count) {
            // One is substantially darker than all the others, so accept it
            return [filled[i].key, raw];
          }
        }
      }

      // Multiple filled in circles? ... check OCR
      if (ocr) return [ocr, raw];
      // Otherwise nothing
      return [' ', raw];
    } else {
      // return the one with the highest weight
      let best_key = null;
      let best_weight = -Infinity;
      for (let i = 0; i < filled.length; i++) {
        if (!filled[i].crossed) {
          if (filled[i].filled_weight > best_weight) {
            best_key = filled[i].key;
            best_weight = filled[i].filled_weight;
          }
        }
      }
      // Settle ties with proba
      //best_key = filled.filter(f => !f.crossed && f.filled_weight === best_weight).sort((a, b) => b.proba.filled - a.proba.filled)[0].key;
      // Settle ties with brightness (darker == better)
      best_key = filled.filter(f => !f.crossed && f.filled_weight === best_weight).sort((a, b) => a.brightness - b.brightness)[0].key;
      return [best_key, raw];
    }
  }

  // If there is nothing filled in but there are crossed circles, do OCR
  if (filled_count === 0 && crossed_count >= MIN_CROSSED_OCR) {
    if (ocr !== null) {
      // If the answer given in OCR is crossed out, take it
      for (let i = 0; i < filled.length; i++) {
        if (filled[i].crossed && filled[i].key === ocr) {
          return [ocr, raw];
        }
      }
      // Otherwise mark as questionable and take the ocr
      raw.questionable = true;
      return [ocr, raw];
    }
  }
  // If there is something filled in, but there are crossed circles
  // and the crossed circle is the same answer as the OCR, take it
  // but mark as questionable
  if (filled_count >= 1 && crossed_count >= MIN_CROSSED_OCR) {
    raw.questionable = true;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].crossed && filled[i].key === ocr) {
        return [ocr, raw];
      }
    }
  }
  // One answer and crossed circles? At this stage we know there is
  // no matching OCR so take the filled in
  if (filled_count === 1) {
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].filled && !filled[i].crossed) return [filled[i].key, raw];
    }
    throw new Error("This shouldn't happen");
  }
  // No answers at all? Return nothing
  if (filled_count === 0 && crossed_count === 0) {
    return [' ', raw];
  }

  // If none of these passed, it's questionable
  raw.questionable = true;

  // If there's only crossed and no OCR, pick the one with the highest filled_weight
  {
    
    let best_key = null;
    let best_weight = -Infinity;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].crossed && filled[i].filled_weight > best_weight) {
        best_key = filled[i].key;
        best_weight = filled[i].filled_weight;
      }
    }
    //best_key = filled.filter(f => f.crossed && f.filled_weight === best_weight).sort((a, b) => b.proba.filled - a.proba.filled)[0].key;
    best_key = filled.filter(f => f.crossed && f.filled_weight === best_weight)[0].key;
    if (best_key !== null) return [best_key, raw];
  }
  // Return nothing
  return [' ', raw];
};

const fill_simple = async (roi) => {
  let fill = {
    filled: false,
    crossed: false,
    empty: false,
    filled_weight: 0,
    crossed_weight: 0,
    empty_weight: 0,
    brightness: -1
  };
  const cv = await cvReadyPromise;

  let circ_x = 29.5, circ_y = 29.5;
  // Get avg brightness
  let mask = cv.Mat.zeros(roi.rows, roi.cols, cv.CV_8UC1);
  const rad = 21.5;
  cv.circle(mask, new cv.Point(circ_x, circ_y), rad - 4.0, new cv.Scalar(255), -1);

  // Compute mean
  let meanScalar = cv.mean(roi, mask);   // returns [mean, 0, 0, 0]
  fill.brightness = meanScalar[0];
  mask.delete();

  return fill;
};

const predictBubble = async (mats, predict) => {
  const p = await predict(mats);
  return p.map(pre => ({
    empty: pre[0],
    filled: pre[1],
    crossed: pre[2]
  }));
};

const predict_vertical_cas = async (mat, lat, answer_key, bubblepredict, abcdepredict) => {
  const cv = await cvReadyPromise;
  const mats = [];
  mats.length = lat.cols;
  for (let x = 0; x < lat.cols; x++) {
    let xpos = Math.floor(lat.xstep * x + lat.xstart) - 27 + 4;
    let ypos = lat.ystart - 146 + 4;
    let w = 50;
    let h = 96;

    const roi = mat.roi(new cv.Rect(xpos, ypos, w, h));
    let meanScalar = cv.mean(roi);
    let totalBrightness = meanScalar[0] * w * h;
    let avgBrightness = (255 * (166 * 103 - w * h) + totalBrightness) / (166 * 103);
    if (avgBrightness < 254) {
      const workingMat = new cv.Mat(103, 166, cv.CV_8UC1, new cv.Scalar(255));
      const workingMatRoi = workingMat.roi(new cv.Rect(Math.floor((166 - w) / 2), Math.floor((103 - h) / 2), w, h));

      roi.copyTo(workingMatRoi);
      workingMatRoi.delete();

      mats[x] = workingMat;
      //dbgOutputAppend(await matToBlobURL(mats[x]));
    } else {
      mats[x] = null;
    }
    roi.delete();
  }
  const ocrss = await ocr_all([mats], answer_key, abcdepredict);
  const ocrs = ocrss[0];
  //console.log("ocrs", ocrs);

  let answers = [];
  let answers_raw = [];

  const choices = [];
  for (let i = 0; i < lat.cols; i++) {
    const filled = [];
    const mats = [];
    let x = Math.floor(lat.xstep * i + lat.xstart);
    for (let idx = 0; idx < lat.rows; idx++) {
      let y = Math.floor(lat.ystep * idx + lat.ystart);
      let roi = mat.roi(new cv.Rect(x - 30, y - 30, 60, 60));
      filled.push(await fill_simple(roi));
      mats.push(roi);
    }
    const ocr = [];
    if (ocrs[i]) ocr.push(ocrs[i]);
    choices.push({ i, mats, filled, ocr });
  }

  {
    const predictionss = await predictBubble(choices.map(c => c.mats).flat(), bubblepredict);
    for (let i = 0; i < lat.cols; i++) {
      const pos = lat.rows * i;
      choices[i].predictions = predictionss.slice(pos, pos + lat.rows);
    }
  }

  for (const { i, mats, filled, predictions, ocr } of choices) {
    for (let idx = 0; idx < filled.length; idx++) {
      const prediction = predictions[idx];
      mats[idx].delete();
      //filled[idx].proba = predictProba(features);

      filled[idx].key = answer_key[idx];

      // Brightness too high? Overrule
      if (filled[idx].brightness >= 225) { prediction.filled = 0; prediction.crossed = 0; prediction.empty = 1; }

      filled[idx].filled = prediction.filled >= Math.max(prediction.crossed, prediction.empty);
      filled[idx].crossed = prediction.crossed >= Math.max(prediction.filled, prediction.empty);
      filled[idx].empty = prediction.empty >= Math.max(prediction.filled, prediction.crossed);

      if (filled[idx].key == 'W' && (filled[idx].filled || filled[idx].crossed)) {
        // Ugly special-case hack for W, because I was predicting blank spaces as Ws
        // In my training set, the darkest empty W had a brightness of 226.25
        // Even though we have the normal brightness threshold set to 225, this was
        // uncomfortably close for me. 215 was set as the threshold accordingly.
        // 
        // In my dataset there was one example of a legitimately filled in bubble
        // (not W) with brightness of 209 which is why this threshold has been set conservatively.

        if (filled[idx].brightness >= 215) {
          prediction.empty = 1;
          prediction.filled = 0;
          prediction.crossed = 0;
          filled[idx].empty = true;
          filled[idx].filled = false;
          filled[idx].crossed = false;
        }
      }
      // Filled overrides crossed and empty. Crossed overrides empty
      if (filled[idx].filled) { filled[idx].crossed = false; filled[idx].empty = false; }
      if (filled[idx].crossed) filled[idx].empty = false;
      filled[idx].filled_weight = prediction.filled;
      filled[idx].crossed_weight = prediction.crossed;
      filled[idx].empty_weight = prediction.empty;


    }
    //console.log("filled", filled);

    const [answer, answer_raw] = predict_answer_cas(filled, ocr, false);
    //console.log("H:", i, answer, filled, ocr);
    answers.push(answer);
    answers_raw.push(answer_raw);

    //answers.push(' ');
  }
  let result = answers.join("").trimEnd();

  if (result === "") {
    // Use entire OCR if the whole thing is blank
    result = ocrs.map(c => c ? c : '').join("").trimEnd();
  }
  return [result, answers_raw];
};

const get_ocr_q_mats = async (mat, page) => {
  const cv = await cvReadyPromise;
  const xposes = [86, 594, 677, 1186, 1269, 1776, 1859, 2367];
  const matss = [];
  const sections = page > 0 ? 3 : 1;
  for (let s = 0; s < sections; s++) {
    let lt = page === 0 ? 3 : s;
    for (let y = 0; y < 10; y++) {
      const mats = [];
      for (let x = 0; x < 8; x++) {
        let xpos = xposes[x];
        let ypos = Math.floor(known_lattices[page][lt].ystep * y + known_lattices[page][lt].ystart - 39);
        let w = 83;
        let h = 81;
        if (y === 0) {
          // First row, add 22 pixels to the top (158x103)
          ypos -= 22;
          h += 22;
        }
        if (x === 0) {
          // First column, add 83 pixels to the left (166x81)
          xpos -= 83;
          w += 83;
        }
        if (x === 7) {
          // Last column, add 29 pixels to the right (112x81)
          w += 29;
        }
        const roi = mat.roi(new cv.Rect(xpos, ypos, w, h));
        let meanScalar = cv.mean(roi);
        let totalBrightness = meanScalar[0] * w * h;
        let avgBrightness = (255 * (166 * 103 - w * h) + totalBrightness) / (166 * 103);
        if (avgBrightness < 254) {
          const workingMat = new cv.Mat(103, 166, cv.CV_8UC1, new cv.Scalar(255));
          const workingMatRoi = workingMat.roi(new cv.Rect(Math.floor((166 - w) / 2), Math.floor((103 - h) / 2), w, h));

          roi.copyTo(workingMatRoi);
          workingMatRoi.delete();

          mats.push(workingMat);
        } else {
          mats.push(null);
        }
        roi.delete();
      }
      matss.push(mats);
    }
  }

  return matss;
};

const ocr_all = async (matss, answer_key, abcdepredict) => {
  const allmats = [];
  for (const mats of matss) {
    for (const mat of mats) {
      if (mat !== null) allmats.push(mat);
    }
  }
  const abcde_answers = [];
  abcde_answers.length = allmats.length;

  const abcde_key = [null, ...answer_key.split('')];
  if (abcdepredict && allmats.length > 0) {
    const predictions = await abcdepredict(allmats);
    for (let i = 0; i < allmats.length; i++) {
      const prediction = predictions[i];
      const maxscore = Math.max(...prediction);
      for (let j = 0; j < prediction.length; j++) {
        if (prediction[j] === maxscore) {
          if (j < abcde_key.length) abcde_answers[i] = abcde_key[j];
          break;
        }
      }
    }
  }

  let readHead = 0;
  const ocrss = [];
  for (const mats of matss) {
    const ocrs = [];
    for (const mat of mats) {
      let answer = null;
      if (mat !== null) {

        if (abcde_answers[readHead]) answer = abcde_answers[readHead];
        //if (tesseract_answers[readHead]) answer = tesseract_answers[readHead];
        readHead++;
        mat.delete();
      }
      ocrs.push(answer);
    }
    ocrss.push(ocrs);
  }

  return ocrss;
};

const predict_horizontal_cas = async (
  mat,
  answer_key,
  bubblepredict,
  abcdepredict,
  page,
  multiAnswerQuestions = []
) => {
  const cv = await cvReadyPromise;
  const multiAnswerQuestionSet = new Set(multiAnswerQuestions);
  let answers = [], answers_raw = [];
  let matss = await get_ocr_q_mats(mat, page);
  let ocrss = await ocr_all(matss, answer_key, abcdepredict);

  const questions = [];

  const total_questions = page === 0 ? 40 : 120;
  for (let q = 0; q < total_questions; q++) {
    let col = Math.floor(q / 10);
    let row = q % 10;
    let lattice;
    if (page === 0) lattice = known_lattices[page][3 + col];
    else lattice = known_lattices[page][col];
    let y = Math.floor(lattice.ystart + row * lattice.ystep);
    let filled = [];
    let mats = [];
    for (let idx = 0; idx < 5; idx++) {
      let x = Math.floor(lattice.xstep * idx + lattice.xstart);
      let roi = mat.roi(new cv.Rect(x - 30, y - 30, 60, 60));

      filled.push(await fill_simple(roi));
      mats.push(roi);
    }

    let xpos, ypos;
    if (page === 0) {
      xpos = col;
      ypos = row;
    } else {
      xpos = Math.floor(q / 30);
      ypos = q % 30;
    }

    const ocr = [];
    if (ocrss[ypos][xpos * 2]) ocr.push(ocrss[ypos][xpos * 2]);
    if (ocrss[ypos][xpos * 2 + 1]) ocr.push(ocrss[ypos][xpos * 2 + 1]);
    if (xpos > 0 && ocrss[ypos][xpos * 2 - 1]) ocr.push(ocrss[ypos][xpos * 2 - 1]);

    questions.push({ q, filled, mats, ocr });
  }
  {
    const predictionss = await predictBubble(questions.map(c => c.mats).flat(), bubblepredict);
    for (let i = 0; i < questions.length; i++) {
      questions[i].predictions = predictionss.slice(i * 5, i * 5 + 5);
    }
  }
  for (const { q, filled, mats, ocr, predictions } of questions) {
    for (let idx = 0; idx < 5; idx++) {
      const prediction = predictions[idx];
      mats[idx].delete();
      //filled[idx].proba = predictProba(features);
      // Brightness too high? Overrule
      if (filled[idx].brightness >= 225) { prediction.filled = 0; prediction.crossed = 0; prediction.empty = 1; }

      filled[idx].filled = prediction.filled > Math.max(prediction.crossed, prediction.empty);
      filled[idx].crossed = prediction.crossed > Math.max(prediction.filled, prediction.empty);
      filled[idx].empty = prediction.empty > Math.max(prediction.filled, prediction.crossed);
      filled[idx].filled_weight = prediction.filled;
      filled[idx].crossed_weight = prediction.crossed;
      filled[idx].empty_weight = prediction.empty;

      filled[idx].key = answer_key[idx];
    }

    const questionIndex = page === 0 ? q : q + 40;
    const [answer, answer_raw] = predict_answer_cas(
      filled,
      ocr,
      true,
      multiAnswerQuestionSet.has(questionIndex)
    );
    //console.log(q, answer, filled, ocr);
    answers.push(answer);
    answers_raw.push(answer_raw);
  }
  return [answers.join(""), answers_raw, answers];
};

const matToJpeg = async (mat) => {
  const cv = await cvReadyPromise;
  const rgba = new cv.Mat();
  if (mat.type() === cv.CV_8UC1)
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  else if (mat.type() === cv.CV_8UC3)
    cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
  else
    mat.copyTo(rgba);
  const imageData = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);

  const canvas = new OffscreenCanvas(rgba.cols, rgba.rows);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({type: 'image/jpeg', quality: 0.7});
  const reader = new FileReaderSync();
  const dataURL = reader.readAsDataURL(blob);
  rgba.delete();

  return dataURL;
}

const difference = async (field, idx, origValue, scannedValue, mat, x1, y1, x2, y2) => {
  // Clip region
  x1 = Math.max(x1, 0);
  y1 = Math.max(y1, 0);
  x2 = Math.min(x2, mat.cols);
  y2 = Math.min(y2, mat.rows);

  const cv = await cvReadyPromise;
  const rect = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
  const roi = mat.roi(rect);
  const roiCopy = roi.mat_clone();
  roi.delete();
  const img = await matToJpeg(roiCopy);
  roiCopy.delete();

  return {field, idx, origValue, scannedValue, img};
};

const scan_matrix = async data => {
  const [, homographies] = await warpPdfPageLinear(data.bmp, data.page, true);
  return [{ homographies }, []];
};

const scan = async data => {
  const [mat, homographies] = await warpPdfPageLinear(data.bmp, data.page);
  const matOriginal = mat.mat_clone();

  let result;

  if (data.page === 0) {
    const num_mask_mat = await num_mask_mat1Promise;
    num_mask_mat.copyTo(mat, num_mask_mat);

    const bubblepredict = await bubblepredictPromise;
    const abcdepredict = await abcdepredictPromise;
    const answersPromise = predict_horizontal_cas(
      mat,
      "ABCDE",
      bubblepredict,
      abcdepredict,
      data.page,
      data.multiAnswerQuestions
    );
    const digitpredict = await digitpredictPromise;
    const studentNumberPromise = predict_vertical_cas(mat, known_lattices[0][0], "0123456789", bubblepredict, digitpredict);
    const letterpredict = await letterpredictPromise;
    const surnamePromise = predict_vertical_cas(mat, known_lattices[0][1], "ABCDEFGHIJKLMNOPQRSTUVWXYZ-'", bubblepredict, letterpredict);
    const initialsPromise = predict_vertical_cas(mat, known_lattices[0][2], "ABCDEFGHIJKLMNOPQRSTUVWXYZ", bubblepredict, letterpredict);

    const [
      [answers, raw_answers, answer_values],
      [student_number, raw_student_number],
      [surname, raw_surname],
      [initials, raw_initials]
    ] = await Promise.all([answersPromise, studentNumberPromise, surnamePromise, initialsPromise]);

    result = { answers, answer_values, raw_answers, student_number, raw_student_number, surname, raw_surname, initials, raw_initials };
  } else {
    const num_mask_mat = await num_mask_mat2Promise;
    num_mask_mat.copyTo(mat, num_mask_mat);
    
    const bubblepredict = await bubblepredictPromise;
    const abcdepredict = await abcdepredictPromise;
    const answersPromise = predict_horizontal_cas(
      mat,
      "ABCDE",
      bubblepredict,
      abcdepredict,
      data.page,
      data.multiAnswerQuestions
    );
    const [
      [answers2, raw_answers2, answer_values2]
    ] = await Promise.all([answersPromise]);

    result = { answers2, answer_values2, raw_answers2 };
  }

  const imgQPromises = [];

  if ('raw_answers' in result) {
    for (let i = 0; i < 40; i++) {
      if ('questionable' in result.raw_answers[i]) {
        const lat = known_lattices[0][3 + Math.floor(i / 10)];
        let xpos = Math.floor(lat.xstep * 2 + lat.xstart); // Middle of C
        let ypos = Math.floor(lat.ystep * (i % 10) + lat.ystart); // Row
        imgQPromises.push(
          difference("answers", i, null, null, matOriginal, xpos - 380, ypos - 80, xpos + 380, ypos + 80)
          .then(diff => {result.raw_answers[i].questionableImg = diff.img;})
        );
      }
    }
  }

  if ('raw_answers2' in result) {
    for (let i = 0; i < 120; i++) {
      if ('questionable' in result.raw_answers2[i]) {
        const lat = known_lattices[1][Math.floor(i / 10)];
        let xpos = Math.floor(lat.xstep * 2 + lat.xstart); // Middle of C
        let ypos = Math.floor(lat.ystep * (i % 10) + lat.ystart); // Row
        imgQPromises.push(
          difference("answers", i + 40, null, null, matOriginal, xpos - 380, ypos - 80, xpos + 380, ypos + 80)
          .then(diff => {result.raw_answers2[i].questionableImg = diff.img;})
        );
      }
    }
  }
  

  await Promise.all(imgQPromises);

  mat.delete();
  matOriginal.delete();

  return [{ ...result, homographies }, []];
};

onmessage = async e => {
  let func = null;
  switch (e.data.cmd) {
    case "initialize": func = initialize; break;
    case "scan": func = scan; break;
    case "scan_matrix": func = scan_matrix; break;
  }
  try {
    if (func === null) throw new Error(`Unknown scanner command: ${e.data.cmd}`);
    const [response, transferables] = await func(e.data);
    postMessage({ id: e.data.id, ...response }, transferables);
  } catch (err) {
    const error = err instanceof PageAlignmentError ? err.message : `${err.message} : ${err.stack}`;
    postMessage({ id: e.data.id, error });
  } finally {
    e.data.bmp?.close?.();
  }
};
