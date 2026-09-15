import * as mobilenet from '@tensorflow-models/mobilenet';
const mobilenet_promise = mobilenet.load({ version: 2, alpha: 0.5, modelUrl: "../mobilenet.json" });
export default mobilenet_promise;
