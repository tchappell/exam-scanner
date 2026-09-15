import * as tf from '@tensorflow/tfjs';
import JSZip from 'jszip';
import { useState } from 'preact/hooks';
import * as mobilenet from '@tensorflow-models/mobilenet';

export default function ModelTrainer2(props) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState([]);
    const [modelName, setModelName] = useState("trained-model");

    return (<div>
        <h3>Model Trainer (MobileNet-based)</h3>
        {
            open ?
                <>
                    <label htmlFor="modelName">Model name:</label>
                    <input id="modelName" type="text" value={modelName} onInput={e => setModelName(e.target.value)} />
                    <table>
                        <thead>
                            <tr>
                                <th>ZIP filename</th>
                                <th>Sample count</th>
                                <th>W</th>
                                <th>H</th>
                                <th>Class</th>
                                <th>Training samples</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
                                data.map((datum, i) => <tr key={datum.filename}>
                                    <td style={{ border: "1px solid" }}>{datum.filename}</td>
                                    <td style={{ border: "1px solid" }}>{datum.xsArray.length}</td>
                                    <td style={{ border: "1px solid" }}>{datum.xsArray[0].width}</td>
                                    <td style={{ border: "1px solid" }}>{datum.xsArray[0].height}</td>
                                    <td style={{ border: "1px solid" }}><input type="number" value={datum.cls} onInput={e => {
                                        setData(prev => [
                                            ...prev.slice(0, i),
                                            { ...prev[i], cls: e.target.value },
                                            ...prev.slice(i + 1)
                                        ]);
                                    }} /></td>
                                    <td style={{ border: "1px solid" }}><input type="number" value={datum.trainCount} onInput={e => {
                                        setData(prev => [
                                            ...prev.slice(0, i),
                                            { ...prev[i], trainCount: e.target.value },
                                            ...prev.slice(i + 1)
                                        ]);
                                    }} /></td>
                                    <td style={{ border: "1px solid" }}><button onClick={e => {
                                        setData(prev => {
                                            for (const bmp of prev.xsArray) bmp.close();
                                            return [...prev.slice(0, i), ...prev.slice(i + 1)];
                                        });
                                    }}>❌</button></td>

                                </tr>)
                            }
                        </tbody>
                    </table>
                    <p>Upload ZIPs:</p>
                    <input type="file" accept="application/zip" multiple onChange={async e => {
                        for (let fi = 0; fi < e.target.files?.length; fi++) {
                            const file = e.target.files?.[fi];
                            if (!file) continue;
                            const xsArray = [];
                            const zip = await JSZip.loadAsync(file);
                            const entries = Object.values(zip.files);
                            for (const entry of entries) {
                                if (entry.dir) continue;
                                if (!/\.png$/i.test(entry.name)) continue;
                                const blob = await entry.async("blob");
                                // Draw to a canvas
                                const bmp = await createImageBitmap(blob);
                                xsArray.push(bmp);
                            }
                            //console.log(xsArray);
                            const newData = {
                                xsArray,
                                cls: 0,
                                trainCount: xsArray.length,
                                filename: file.name
                            };
                            setData(prev => [...prev, newData]);
                        }

                    }} />
                    <div>
                        <button onClick={async e => {
                            const numClasses = Math.max(...data.map(datum => datum.cls)) + 1;
                            const baseModel = await mobilenet.load({ version: 2, alpha: 0.5 });

                            const xsArray = [], ysArray = [];
                            const canvas = document.createElement("canvas");
                            const ctx = canvas.getContext("2d", { willReadFrequently: true });

                            for (const datum of data) {
                                const y = tf.oneHot(tf.tensor1d([datum.cls], 'int32'), numClasses);
                                for (let i = 0; i < datum.trainCount; i++) {
                                    const bmp = datum.xsArray[Math.floor(Math.random() * datum.xsArray.length)];
                                    canvas.width = bmp.width;
                                    canvas.height = bmp.height;
                                    ctx.drawImage(bmp, 0, 0);
                                    const x = baseModel.infer(canvas, true);
                                    xsArray.push(x);
                                    ysArray.push(y);
                                }
                            }
                            const xs = tf.concat(xsArray);
                            const ys = tf.concat(ysArray);

                            const model = tf.sequential();
                            model.add(tf.layers.dense({
                                inputShape: [xs.shape[1]],
                                units: 128,
                                activation: 'relu'
                            }));
                            model.add(tf.layers.dropout({ rate: 0.5 }));
                            model.add(tf.layers.dense({
                                units: numClasses,
                                activation: 'softmax'
                            }));

                            model.compile({
                                optimizer: tf.train.adam(0.0005),
                                loss: 'categoricalCrossentropy',
                                metrics: ['accuracy']
                            });
                            await model.fit(xs, ys, {
                                epochs: 50,
                                batchSize: 32,
                                shuffle: true,
                                validationSplit: 0.1,
                                callbacks: {
                                    onEpochEnd: (epoch, logs) => {
                                        console.log(`Epoch ${epoch + 1}: loss=${logs.loss}, acc=${logs.acc}, val_acc=${logs.val_acc}`);
                                    }
                                }
                            });
                            await model.save('downloads://'+modelName);
                        }}>Train Model</button>
                    </div>
                    <div>
                        <button onClick={e => setOpen(false)}>Close</button>
                    </div>
                </>
                :
                <button onClick={e => setOpen(true)}>Open</button>
        }
    </div>);
}
