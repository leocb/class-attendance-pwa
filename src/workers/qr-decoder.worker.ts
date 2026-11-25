import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => {
      if (path.endsWith('.wasm')) {
        return '/zxing_reader.wasm';
      }
      return prefix + path;
    },
  },
});

interface DecodeRequest {
  id: number;
  imageData: ImageData;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, imageData } = event.data;
  try {
    const results = await readBarcodes(imageData, {
      formats: ['QRCode'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 1,
    });
    const text = results[0]?.text ?? null;
    self.postMessage({ id, text });
  } catch {
    self.postMessage({ id, text: null });
  }
};
