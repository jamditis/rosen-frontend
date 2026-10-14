# Semantic search third-party assets

These files let the optional semantic search run from archive-local URLs. The
application downloads them only after a reader turns on "Search by meaning."

## Model

`models/Xenova/bge-small-en-v1.5/` contains the q8 ONNX model, configuration,
and tokenizer files from `Xenova/bge-small-en-v1.5` revision
`ea104dacec62c0de699686887e3f920caeb4f3e3`. That repository is an ONNX port of
`BAAI/bge-small-en-v1.5` revision
`5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`. The base model card states that
FlagEmbedding and the released models use the MIT License. The license text is
in `licenses/BAAI-bge-small-en-v1.5-MIT.txt`.

Sources:

- https://huggingface.co/Xenova/bge-small-en-v1.5/tree/ea104dacec62c0de699686887e3f920caeb4f3e3
- https://huggingface.co/BAAI/bge-small-en-v1.5/tree/5c38ec7c405ec4b44b94cc5a9bb96e735b38267a
- https://github.com/FlagOpen/FlagEmbedding/blob/fd1a2bdf69488ffebe0327999d4400d8c8058a0b/LICENSE

## Transformers.js

`runtime/transformers.web.min.js` comes from the published
`@huggingface/transformers@4.2.0` npm package. It is licensed under Apache-2.0.
The license text is in `licenses/transformers-Apache-2.0.txt`.

Native worker import maps do not resolve the package's two bare ONNX Runtime
imports. The vendored copy changes only `onnxruntime-web/webgpu` and
`onnxruntime-common` to the sibling `./ort.webgpu.bundle.min.mjs`. The manifest
records both the unmodified upstream SHA-256 and the deployed SHA-256.

Source: https://www.npmjs.com/package/@huggingface/transformers/v/4.2.0

## ONNX Runtime Web

The `runtime/ort*` files come unchanged from the published
`onnxruntime-web@1.26.0-dev.20260416-b7804b056c` npm package. ONNX Runtime is
licensed under the MIT License. The license text is in
`licenses/onnxruntime-MIT.txt`.

Source: https://www.npmjs.com/package/onnxruntime-web/v/1.26.0-dev.20260416-b7804b056c

`manifest.json` records the source pins, npm integrity values, byte sizes, and
SHA-256 digest of each deployed third-party file.
