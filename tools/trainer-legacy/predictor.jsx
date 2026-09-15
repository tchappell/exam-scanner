import * as tf from '@tensorflow/tfjs';

export default async function predictor(url)
{
    const model = await tf.loadLayersModel(url);

    return async (mats) => {
        const xsArray = [];
        for (const mat of mats) {
            const x = tf.tidy(() => {
                // Get pixel data as Uint8Array
                const data = mat.data;  // or mat.data8S / mat.data8U depending on build
                
                // Create tensor [60, 60, 1]
                const t = tf.tensor3d(data, [mat.rows, mat.cols, 1], 'float32');
                
                // Normalize to [0,1]
                return t.div(255.0);
            });
            xsArray.push(x);
        }
        const xs = tf.stack(xsArray);
        for (const x of xsArray) x.dispose();

        const logits = model.predict(xs);
        const probs = await logits.array();
        xs.dispose();
        logits.dispose();

        return probs;
    };
}
