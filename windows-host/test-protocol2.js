const { app, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'watchparty', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
]);

app.whenReady().then(() => {
  protocol.handle('watchparty', (request) => {
    console.log('REQUEST URL:', request.url);
    let filePath = decodeURIComponent(request.url.replace('watchparty://local/', ''));
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    console.log('FILE PATH:', filePath);
    return net.fetch('file:///' + filePath).then(res => {
      console.log('FETCH STATUS:', res.status);
      app.quit();
      return res;
    }).catch(err => {
      console.error('FETCH ERROR:', err);
      app.quit();
      throw err;
    });
  });
  
  net.fetch('watchparty://local/C:/Users/biban/Downloads/your_movie_watchparty.mp4').catch(() => {});
});
