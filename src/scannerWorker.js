import cvReadyPromise from "@techstark/opencv-js";
import predictor from './predictor2';

const ORB_FEATURES = 500;

const loadTemplateImages = async () => {
  const templatePaths = [
    "../page1.png", "../page2.png"
  ];
  const templateImages = [];

  for (const templatePath of templatePaths) {
    const res = await fetch(templatePath, { mode: 'cors' });
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const cv = await cvReadyPromise;
    const mat_original = cv.matFromImageData(imageData);
    const mat = new cv.Mat();
    cv.cvtColor(mat_original, mat, cv.COLOR_BGR2GRAY);
    mat_original.delete();

    const orb = new cv.ORB(ORB_FEATURES);
    const kp = new cv.KeyPointVector();
    const des = new cv.Mat();
    const mask = new cv.Mat();
    orb.detectAndCompute(mat, mask, kp, des);
    orb.delete();
    mask.delete();

    const templateImage = { mat, kp, des };
    templateImages.push(templateImage);
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
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cv = await cvReadyPromise;
  const num_mask_mat = new cv.Mat();
  const mat_original = cv.matFromImageData(imageData);

  cv.cvtColor(mat_original, num_mask_mat, cv.COLOR_BGR2GRAY);
  mat_original.delete();
  return num_mask_mat;
};

const templateImagesPromise = loadTemplateImages();
const bubblepredictPromise = loadPredict("../bubble-detector.json");
const abcdepredictPromise = loadPredict("../abcde-n-detector.json");
const letterpredictPromise = loadPredict("../letter-detector.json");
const digitpredictPromise = loadPredict("../digit-detector.json");
const num_mask_mat1Promise = loadImage("../num_mask_page1.png");
const num_mask_mat2Promise = loadImage("../num_mask_page2.png");

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

// This function is largely copy-pasted from warpPdfPageLinear
const createProjectionMatrices = async (bmp, templatePage) => {
  const cv = await cvReadyPromise;
  const templateImages = await templateImagesPromise;

  const template = templateImages[templatePage];
  // These objects will need to be cleaned up
  const mat = new cv.Mat();
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const orb = new cv.ORB(ORB_FEATURES);
  const kp = new cv.KeyPointVector();
  const knn = new cv.DMatchVectorVector();
  const des = new cv.Mat();
  const mask = new cv.Mat();
  const inlierMask = new cv.Mat();
  const wmat = new cv.Mat();
  const circlesMat = new cv.Mat();
  const Hfinal = new cv.Mat(3, 3, cv.CV_32FC1);
  const Hblank = new cv.Mat();
  const Hinvert = new cv.Mat();
  const homographies = [];

  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
    ctx = null;
    canvas.width = 0; canvas.height = 0;
    const mat_original = cv.matFromImageData(imageData);
    cv.cvtColor(mat_original, mat, cv.COLOR_BGR2GRAY);
    mat_original.delete();
    const pdfScale = mat.rows / 3508;
    //console.log("SIZE", mat.cols, mat.rows);

    // Compute ORB features
    orb.detectAndCompute(mat, mask, kp, des);
    orb.delete();
    mask.delete();

    // Now match features against the template
    bf.knnMatch(template.des, des, knn, 2);
    const pts1 = [], pts2 = [];
    for (let i = 0; i < knn.size(); i++) {
      const dmatch = knn.get(i);

      const m = dmatch.get(0);
      const n = dmatch.get(1);
      if (m.distance < 0.75 * n.distance) {
        const p1 = template.kp.get(m.queryIdx).pt;
        const p2 = kp.get(m.trainIdx).pt;
        pts1.push(p1.x, p1.y);
        pts2.push(p2.x, p2.y);
      }
      dmatch.delete();
    }

    let points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
    let points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);

    const H = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);
    const transH = [...H.data64F];
    cv.invert(H, Hinvert, cv.DECOMP_LU);
    const invH = [...Hinvert.data64F];

    try {
      cv.GaussianBlur(mat, wmat, new cv.Size(5, 5), 0);
      // Hough circles
      cv.HoughCircles(
        wmat,
        circlesMat,
        cv.HOUGH_GRADIENT,
        1, // dp
        15, // minDist
        40, // param1 (higher threshold for Canny edge detector)
        28, // param2 (accumulator threshold)
        18*pdfScale, // minRadius (we are after circles with rad 22.5)
        27*pdfScale  // maxRadius
      );
      const circles = [];
      for (let i = 0; i < circlesMat.cols; ++i) {
        let x = circlesMat.data32F[i * 3];
        let y = circlesMat.data32F[i * 3 + 1];
        let radius = circlesMat.data32F[i * 3 + 2];
        circles.push([x, y, radius]);
      }

      const sqrSearchRadius = Math.pow(25*pdfScale, 2);
      points1.delete(); points2.delete();
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
              //console.log([x, y], "->", closest_circle.slice(0,2));
              //cv.circle(wmat, new cv.Point(closest_circle[0], closest_circle[1]), 20, color, -1);
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

        points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
        points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);
        let H2 = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);
        cv.invert(H2, Hinvert, cv.DECOMP_LU);
        const srcCorners = cv.matFromArray(2, 1, cv.CV_32FC2, [rect_x, rect_y, rect_x + rect_w, rect_y + rect_h]);
        const dstCorners = new cv.Mat();
        cv.perspectiveTransform(srcCorners, dstCorners, Hinvert);
        let o_rect_x = dstCorners.data32F[0];
        let o_rect_y = dstCorners.data32F[1];
        let o_rect_w = dstCorners.data32F[2] - o_rect_x;
        let o_rect_h = dstCorners.data32F[3] - o_rect_y;
        srcCorners.delete(); dstCorners.delete();
        let [prev_rect_x, prev_rect_y, prev_rect_w, prev_rect_h] = [rect_x, rect_y, rect_w, rect_h];
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

        points1.delete(); points2.delete();
        for (let i = 0; i < pts1.length / 2; i++) {
          pts1[i * 2 + 0] -= rect_x;
          pts1[i * 2 + 1] -= rect_y;
        }
        points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
        points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);

        H2.delete();
        H2 = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);

        cv.invert(H2, Hinvert, cv.DECOMP_LU);
        homographies.push({
          rect_x: prev_rect_x,
          rect_y: prev_rect_y,
          rect_w: prev_rect_w,
          rect_h: prev_rect_h,
          matrix: Array.from(Hinvert.data64F)
        });

        points1.delete(); points2.delete();
        H2.delete();
      }

    } finally { H.delete(); }
  } finally {
    bf.delete(); knn.delete(); kp.delete(); des.delete(); wmat.delete();
    Hinvert.delete(); Hfinal.delete(); Hblank.delete();
    inlierMask.delete();
    circlesMat.delete();
    mat.delete();
  }
  return homographies;
};

const warpPdfPageLinear = async (bmp, templatePage) => {
  const cv = await cvReadyPromise;
  const templateImages = await templateImagesPromise;

  const template = templateImages[templatePage];
  // These objects will need to be cleaned up
  const mat = new cv.Mat();
  const matOut = template.mat.mat_clone();
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const orb = new cv.ORB(ORB_FEATURES);
  const kp = new cv.KeyPointVector();
  const knn = new cv.DMatchVectorVector();
  const des = new cv.Mat();
  const mask = new cv.Mat();
  const inlierMask = new cv.Mat();
  const wmat = new cv.Mat();
  const circlesMat = new cv.Mat();
  const Hfinal = new cv.Mat(3, 3, cv.CV_32FC1);
  const Hblank = new cv.Mat();
  const Hinvert = new cv.Mat();
  const homographies = [];

  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
    ctx = null;
    canvas.width = 0; canvas.height = 0;
    const mat_original = cv.matFromImageData(imageData);
    cv.cvtColor(mat_original, mat, cv.COLOR_BGR2GRAY);
    mat_original.delete();
    const pdfScale = mat.rows / 3508;
    //console.log("SIZE", mat.cols, mat.rows);

    // Compute ORB features
    orb.detectAndCompute(mat, mask, kp, des);
    orb.delete();
    mask.delete();

    // Now match features against the template
    bf.knnMatch(template.des, des, knn, 2);
    const pts1 = [], pts2 = [];
    for (let i = 0; i < knn.size(); i++) {
      const dmatch = knn.get(i);

      const m = dmatch.get(0);
      const n = dmatch.get(1);
      if (m.distance < 0.75 * n.distance) {
        const p1 = template.kp.get(m.queryIdx).pt;
        const p2 = kp.get(m.trainIdx).pt;
        pts1.push(p1.x, p1.y);
        pts2.push(p2.x, p2.y);
      }
      dmatch.delete();
    }

    let points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
    let points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);

    const H = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);
    const transH = [...H.data64F];
    cv.invert(H, Hinvert, cv.DECOMP_LU);
    const invH = [...Hinvert.data64F];

    try {

      // 6) Warp img2 into img1 frame
      // cv.warpPerspective(
      //   mat,               // src
      //   wmat,                // dst
      //   H,                  // homography
      //   new cv.Size(template.mat.cols, template.mat.rows), // output size
      //   cv.INTER_LINEAR,
      //   cv.BORDER_REPLICATE
      // );

      // Following the warp...

      cv.GaussianBlur(mat, wmat, new cv.Size(5, 5), 0);
      // Hough circles
      cv.HoughCircles(
        wmat,
        circlesMat,
        cv.HOUGH_GRADIENT,
        1, // dp
        15, // minDist
        40, // param1 (higher threshold for Canny edge detector)
        28, // param2 (accumulator threshold)
        18*pdfScale, // minRadius (we are after circles with rad 22.5)
        27*pdfScale  // maxRadius
      );

      // // draw circles
      //const color = new cv.Scalar(0, 0, 0);
      const circles = [];
      for (let i = 0; i < circlesMat.cols; ++i) {
        let x = circlesMat.data32F[i * 3];
        let y = circlesMat.data32F[i * 3 + 1];
        let radius = circlesMat.data32F[i * 3 + 2];
        circles.push([x, y, radius]);
        //let center = new cv.Point(x, y);
        //cv.circle(wmat, center, radius, color);
      }
      //console.log("circles", circles);

      // dbgOutput([await matToBlobURL(blurMat)]);
      // console.log(circles);

      // Search for known lattice
      // (will be different for pages != 0)



      const sqrSearchRadius = Math.pow(25*pdfScale, 2);
      points1.delete(); points2.delete();
      let next_global_drift_x = 0, next_global_drift_y = 0;
      for (let li = 0; li < known_lattices[templatePage].length; li++) {
        const global_drift_x = next_global_drift_x;
        const global_drift_y = next_global_drift_y;
        next_global_drift_x = 0;
        next_global_drift_y = 0;
        //console.log(`lattice ${li}`);
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
              //console.log([x, y], "->", closest_circle.slice(0,2));
              //cv.circle(wmat, new cv.Point(closest_circle[0], closest_circle[1]), 20, color, -1);
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

        points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
        points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);
        let H2 = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);
        //console.log("pts1", pts1);
        //console.log("pts2", pts2);
        //cv.gemm(H, H2, 1, Hblank, 0, Hfinal);
        cv.invert(H2, Hinvert, cv.DECOMP_LU);
        const srcCorners = cv.matFromArray(2, 1, cv.CV_32FC2, [rect_x, rect_y, rect_x + rect_w, rect_y + rect_h]);
        const dstCorners = new cv.Mat();
        cv.perspectiveTransform(srcCorners, dstCorners, Hinvert);
        let o_rect_x = dstCorners.data32F[0];
        let o_rect_y = dstCorners.data32F[1];
        let o_rect_w = dstCorners.data32F[2] - o_rect_x;
        let o_rect_h = dstCorners.data32F[3] - o_rect_y;
        srcCorners.delete(); dstCorners.delete();
        //console.log("Copying from", [o_rect_x, o_rect_y, o_rect_w, o_rect_h], "to", [rect_x, rect_y, rect_w, rect_h]);
        // Crop o_rect to mat
        let [prev_rect_x, prev_rect_y, prev_rect_w, prev_rect_h] = [rect_x, rect_y, rect_w, rect_h];
        if (o_rect_x < 0) {
          //console.log("crop 1", rect_x, rect_y, rect_w, rect_h, o_rect_x, o_rect_y, o_rect_w, o_rect_h);
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

        //console.log(`Warp: ${rect_x},${rect_y} ${rect_w}*${rect_h} --> ${o_rect_x},${o_rect_y} ${o_rect_w}*${o_rect_h}`);

        points1.delete(); points2.delete();

        //points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);
        //cv.invert(H, Hinvert, cv.DECOMP_LU);
        //cv.perspectiveTransform(points2, points2, Hinvert);
        for (let i = 0; i < pts1.length / 2; i++) {
          pts1[i * 2 + 0] -= rect_x;
          pts1[i * 2 + 1] -= rect_y;
          //pts2[i * 2 + 0] = points2.data32F[i * 2 + 0];
          //pts2[i * 2 + 1] = points2.data32F[i * 2 + 1];
        }
        //points2.delete();
        points1 = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
        points2 = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);

        H2.delete();
        H2 = cv.findHomography(points2, points1, cv.RANSAC, 3.0, inlierMask);
        //const matRoi = mat.roi(new cv.Rect(o_rect_x, o_rect_y, o_rect_w, o_rect_h));
        const outRoi = matOut.roi(new cv.Rect(rect_x, rect_y, rect_w, rect_h));
        cv.warpPerspective(
          mat,                // src
          outRoi,                // dst
          H2,             // homography
          new cv.Size(rect_w, rect_h), // output size
          cv.INTER_LINEAR,
          cv.BORDER_REPLICATE
        );

        cv.invert(H2, Hinvert, cv.DECOMP_LU);
        homographies.push({
          rect_x: prev_rect_x,
          rect_y: prev_rect_y,
          rect_w: prev_rect_w,
          rect_h: prev_rect_h,
          matrix: Array.from(Hinvert.data64F)
        });
        //matRoi.delete();
        outRoi.delete();

        points1.delete(); points2.delete();
        H2.delete();
      }

    } finally { H.delete(); }
  } catch (e) {
    matOut.delete();
    throw e;
  } finally {
    bf.delete(); knn.delete(); kp.delete(); des.delete(); wmat.delete();
    Hinvert.delete(); Hfinal.delete(); Hblank.delete();
    inlierMask.delete();
    circlesMat.delete();
    mat.delete();
  }
  //console.log("finished scanning page", currentPage);
  return [matOut, homographies];
};

const predict_answer_cas = (filled, ocrlist, anticheat = false) => {
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

const predict_horizontal_cas = async (mat, answer_key, bubblepredict, abcdepredict, page) => {
  const cv = await cvReadyPromise;
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

    const [answer, answer_raw] = predict_answer_cas(filled, ocr, true);
    //console.log(q, answer, filled, ocr);
    answers.push(answer);
    answers_raw.push(answer_raw);
  }
  return [answers.join(""), answers_raw];
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
  return [{homographies: await createProjectionMatrices(data.bmp, data.page)}, []];
};

const scan = async data => {
  const [mat, homographies] = await warpPdfPageLinear(data.bmp, data.page);
  const compare = data.compare ?? {};
  const diffPromises = [];
  const matOriginal = mat.mat_clone();

  let result;

  if (data.page === 0) {
    const num_mask_mat = await num_mask_mat1Promise;
    num_mask_mat.copyTo(mat, num_mask_mat);

    const bubblepredict = await bubblepredictPromise;
    const abcdepredict = await abcdepredictPromise;
    const answersPromise = predict_horizontal_cas(mat, "ABCDE", bubblepredict, abcdepredict, data.page)
    .then(([answers, raw_answers]) => {
      if ('q' in compare) {
        const a = answers.split('');
        for (let i = 0; i < 40; i++) {
          if (a[i].trimEnd() !== compare.q[i]) {
            const lat = known_lattices[0][3 + Math.floor(i / 10)];
            let xpos = Math.floor(lat.xstep * 2 + lat.xstart); // Middle of C
            let ypos = Math.floor(lat.ystep * (i % 10) + lat.ystart); // Row
            diffPromises.push(difference("answers", i, compare.q[i], a[i].trimEnd(), matOriginal, xpos - 380, ypos - 80, xpos + 380, ypos + 80));
          }
        }
      }
      return [answers, raw_answers];
    });
    const digitpredict = await digitpredictPromise;
    const studentNumberPromise = predict_vertical_cas(mat, known_lattices[0][0], "0123456789", bubblepredict, digitpredict)
    .then(([student_number, raw_student_number]) => {
      if ('studentNum' in compare) {
        const filt = sn => sn.split('').filter(c => !isNaN(c) && c !== ' ').join('');
        if (filt(student_number) !== filt(compare.studentNum)) {
          const lat = known_lattices[0][0];
          let x1 = Math.floor(lat.xstart - 50);
          let y1 = Math.floor(lat.ystart - 160);
          let x2 = Math.floor(lat.xstart + 550);
          let y2 = Math.floor(lat.ystart + 650);
          diffPromises.push(difference("studentNum", null, compare.studentNum, student_number, matOriginal, x1, y1, x2, y2));
        }
      }
      return [student_number, raw_student_number];
    });
    const letterpredict = await letterpredictPromise;
    const surnamePromise = predict_vertical_cas(mat, known_lattices[0][1], "ABCDEFGHIJKLMNOPQRSTUVWXYZ-'", bubblepredict, letterpredict)
    .then(([surname, raw_surname]) => {
      if ('surname' in compare) {
        const filt = sn => sn.trimEnd();
        if (filt(surname) !== filt(compare.surname)) {
          const lat = known_lattices[0][1];
          let x1 = Math.floor(lat.xstart - 50);
          let y1 = Math.floor(lat.ystart - 160);
          let x2 = Math.floor(lat.xstart + 840);
          let y2 = Math.floor(lat.ystart + 1820);
          diffPromises.push(difference("surname", null, compare.surname, surname, matOriginal, x1, y1, x2, y2));
        }
      }
      return [surname, raw_surname];
    });
    const initialsPromise = predict_vertical_cas(mat, known_lattices[0][2], "ABCDEFGHIJKLMNOPQRSTUVWXYZ", bubblepredict, letterpredict)
    .then(([initials, raw_initials]) => {
      if ('initial' in compare) {
        const filt = sn => sn.replaceAll(' ','');
        if (filt(initials) !== filt(compare.initial)) {
          const lat = known_lattices[0][2];
          let x1 = Math.floor(lat.xstart - 50);
          let y1 = Math.floor(lat.ystart - 160);
          let x2 = Math.floor(lat.xstart + 200);
          let y2 = Math.floor(lat.ystart + 1680);
          diffPromises.push(difference("initials", null, compare.initial, initials, matOriginal, x1, y1, x2, y2));
        }
      }
      return [initials, raw_initials];
    });

    const [
      [answers, raw_answers],
      [student_number, raw_student_number],
      [surname, raw_surname],
      [initials, raw_initials]
    ] = await Promise.all([answersPromise, studentNumberPromise, surnamePromise, initialsPromise]);

    result = { answers, raw_answers, student_number, raw_student_number, surname, raw_surname, initials, raw_initials };
  } else {
    const num_mask_mat = await num_mask_mat2Promise;
    num_mask_mat.copyTo(mat, num_mask_mat);
    
    const bubblepredict = await bubblepredictPromise;
    const abcdepredict = await abcdepredictPromise;
    const answersPromise = predict_horizontal_cas(mat, "ABCDE", bubblepredict, abcdepredict, data.page)
    .then(([answers, raw_answers]) => {
      if ('q' in compare) {
        const a = answers.split('');
        for (let i = 0; i < 120; i++) {
          if (a[i].trimEnd() !== compare.q[i + 40]) {
            const lat = known_lattices[1][Math.floor(i / 10)];
            let xpos = Math.floor(lat.xstep * 2 + lat.xstart); // Middle of C
            let ypos = Math.floor(lat.ystep * (i % 10) + lat.ystart); // Row
            diffPromises.push(difference("answers", i + 40, compare.q[i + 40], a[i].trimEnd(), matOriginal, xpos - 380, ypos - 80, xpos + 380, ypos + 80));
          }
        }
      }
      return [answers, raw_answers];
    });
    const [
      [answers2, raw_answers2]
    ] = await Promise.all([answersPromise]);

    result = { answers2, raw_answers2 };
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
  

  const diffs = await Promise.all(diffPromises);
  await Promise.all(imgQPromises);

  mat.delete();
  matOriginal.delete();

  return [{ ...result, diffs, homographies }, []];
};

onmessage = async e => {
  let func = null;
  switch (e.data.cmd) {
    case "scan": func = scan; break;
    case "scan_matrix": func = scan_matrix; break;
  }
  try {
    if (func === null) throw new Error(`Unknown scanner command: ${e.data.cmd}`);
    const [response, transferables] = await func(e.data);
    postMessage({ id: e.data.id, ...response }, transferables);
  } catch (err) {
    postMessage({ id: e.data.id, error: `${err.message} : ${err.stack}` });
  }
};
