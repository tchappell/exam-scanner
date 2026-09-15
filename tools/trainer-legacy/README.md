# Legacy classifier training tools

These files were used to train earlier generations of the exam scanner's image
classifiers. They are retained as historical and technical reference, but they
are not imported by the production application and are not included in its Vite
module graph.

## Contents

- `ModelTrainer.jsx` trains a small TensorFlow.js classifier from labelled ZIPs.
- `ModelTrainer2.jsx` is the later MobileNet-based training experiment.
- `predictor.jsx` loads models produced by the earlier trainer.
- `models/` contains superseded model files and reference images previously kept
  under `public/bak`.

These files are not currently a runnable standalone application: they depend on
UI context and data conventions that were never documented. If classifier
retraining becomes necessary, the recommended approach is to build a small
separate Vite entry point here, document the training ZIP schema, and add a
held-out validation report before producing replacement runtime models.
