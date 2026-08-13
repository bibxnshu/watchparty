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
    console.log('Fetching:', finalUrl, 'Headers:', Array.from(request.headers.entries()));
    return net.fetch(finalUrl, {
      headers: request.headers
    });
  });

  const win = new BrowserWindow({ show: true });
  win.webContents.on('console-message', (e, level, msg) => console.log('CONSOLE:', msg));
  
  win.loadURL('data:text/html,<video id="v" src="watchparty://local/' + encodeURIComponent(path.resolve('test.mp4').replace(/\\/g, '/')) + '" autoplay controls></video><script>v.onloadedmetadata = () => { console.log("META LOADED: " + v.duration); v.currentTime = 5; }; v.onseeked = () => console.log("SEEKED TO: " + v.currentTime); </script>');
  setTimeout(() => app.quit(), 10000);
});
