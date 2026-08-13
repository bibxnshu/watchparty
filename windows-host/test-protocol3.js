const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'watchparty', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
]);

app.whenReady().then(() => {
  protocol.handle('watchparty', (request) => {
    let filePath = decodeURIComponent(request.url.replace('watchparty://local/', ''));
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    return net.fetch('file:///' + filePath);
  });

  const win = new BrowserWindow({ show: true });
  win.loadURL('data:text/html,<video src="watchparty://local/C:/Users/biban/Downloads/your_movie_watchparty.mp4" autoplay controls></video>');
  setTimeout(() => app.quit(), 5000);
});
