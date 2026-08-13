// This worker handles all canvas drawing completely off the main thread.
// The main thread sends ImageBitmap objects (GPU-accelerated, zero-copy)
// and this worker draws them to the OffscreenCanvas.

let canvas = null;
let ctx = null;

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'init') {
    canvas = e.data.canvas;
    ctx = canvas.getContext('2d');
  } else if (type === 'frame') {
    const { bitmap, width, height } = e.data;
    if (ctx && canvas && bitmap) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
    }
  }
};
