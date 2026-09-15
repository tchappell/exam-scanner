import * as tf from '@tensorflow/tfjs';
import modelpromise from './mobilenet-loader';
export default async function predictor(url, opencv) {
    const model = await tf.loadLayersModel(url);
    const cv = opencv;
    const baseModel = await modelpromise;
    const canvas = new OffscreenCanvas(1, 1);
    const rgba = new cv.Mat();

    function matToImageData(mat) {
        if (mat.type() === cv.CV_8UC1)
            cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
        else if (mat.type() === cv.CV_8UC3)
            cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
        else
            mat.copyTo(rgba);
        return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
    }

    return async (mats) => {
        const xsArray = [];
        for (const mat of mats) {
            const x = tf.tidy(() => {
                const imageData = matToImageData(mat);
                const t = baseModel.infer(imageData, true);
                return t;
            });
            xsArray.push(x);
        }
        const xs = tf.concat(xsArray);
        for (const x of xsArray) x.dispose();

        const logits = model.predict(xs);
        const probs = await logits.array();
        xs.dispose();
        logits.dispose();

        return probs;
    };
}
