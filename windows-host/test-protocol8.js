const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

app.whenReady().then(() => {
  fs.writeFileSync('my video.mp4', 'dummy');
  const url = pathToFileURL(path.resolve('my video.mp4')).toString();
  console.log('Fetching:', url);
  net.fetch(url).then(res => {
    console.log('Status:', res.status);
    app.quit();
  }).catch(err => {
    console.log('Error:', err.message);
    app.quit();
  });
});
