
let stream = null;
let detector = null;
let scanning = false;

export async function startScanner(videoEl, onDetected) {
  if (!("BarcodeDetector" in window)) {
    throw new Error("Barcode scanning not supported.");
  }

  detector = new BarcodeDetector({
    formats: ["ean_13", "upc_a", "code_128"]
  });

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  videoEl.srcObject = stream;
  scanning = true;

  async function loop() {
    if (!scanning) return;

    const codes = await detector.detect(videoEl);
    if (codes.length) {
      scanning = false;
      onDetected(codes[0].rawValue);
      return;
    }

    requestAnimationFrame(loop);
  }

  loop();
}

export function stopScanner() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}
