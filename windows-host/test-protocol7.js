const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
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
    const finalUrl = pathToFileURL(path.normalize(filePath)).toString();
    return net.fetch(finalUrl);
  });

  const win = new BrowserWindow({ show: true });
  win.webContents.on('console-message', (e, level, msg) => console.log('CONSOLE:', msg));
  
  // write a small dummy mp4 file
  const buf = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAABXJtZGF0', 'base64');
  fs.writeFileSync('dummy.mp4', buf);

  win.loadURL('data:text/html,<video id="v" src="watchparty://local/' + encodeURIComponent(path.resolve('dummy.mp4').replace(/\\/g, '/')) + '" autoplay controls></video><script>v.onerror = (e) => console.log("ERROR: " + v.error.code); v.onloadedmetadata = () => console.log("META LOADED: " + v.duration)</script>');
  setTimeout(() => app.quit(), 5000);
});
