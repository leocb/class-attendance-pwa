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

interface NativeBarcodeDetector {
  detect(source: ImageData): Promise<Array<{ rawValue?: string }>>;
}

const NativeDetector = (
  self as unknown as {
    BarcodeDetector?: new (options: { formats: string[] }) => NativeBarcodeDetector;
  }
).BarcodeDetector;

let nativeDetector: NativeBarcodeDetector | null = null;
if (NativeDetector) {
  try {
    nativeDetector = new NativeDetector({ formats: ['qr_code'] });
  } catch {
    nativeDetector = null;
  }
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, imageData } = event.data;

  // Chromium exposes the platform barcode scanner (ML Kit) in workers; it is
  // often more reliable on real camera frames than WASM. Fall back to ZXing.
  if (nativeDetector) {
    try {
      const codes = await nativeDetector.detect(imageData);
      const value = codes[0]?.rawValue;
      if (value) {
        self.postMessage({ id, text: value });
        return;
      }
    } catch {
      // Fall through to ZXing.
    }
  }

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
