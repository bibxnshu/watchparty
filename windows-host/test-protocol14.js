const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'watchparty', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true } }
]);

app.whenReady().then(() => {
  protocol.handle('watchparty', (request) => {
    let filePath = decodeURIComponent(request.url.replace('watchparty://local/', ''));
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    filePath = path.normalize(filePath);
    
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    
    let range = request.headers.get('range');
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunksize = (end - start) + 1;
      
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        }
      });
  
      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + totalSize,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      const nodeStream = fs.createReadStream(filePath);
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        }
      });
      
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Length': totalSize.toString(),
          'Content-Type': 'video/mp4',
        }
      });
    }
  });

  const win = new BrowserWindow({ show: true });
  win.webContents.on('console-message', (e, level, msg) => console.log('CONSOLE:', msg));
  
  win.loadURL('data:text/html,<video id="v" src="watchparty://local/' + encodeURIComponent(path.resolve('test.mp4').replace(/\\/g, '/')) + '" autoplay controls></video><script>v.onloadedmetadata = () => { console.log("META LOADED: " + v.duration); v.currentTime = 5; }; v.onseeked = () => console.log("SEEKED TO: " + v.currentTime); </script>');
  setTimeout(() => app.quit(), 10000);
});
