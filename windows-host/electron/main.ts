import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, protocol, net } from 'electron'
import { pathToFileURL } from 'url'

protocol.registerSchemesAsPrivileged([
  { scheme: 'watchparty', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true } }
])
import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false
    },
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    frame: false,
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  // Built-in Adblocker for YouTube
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*.doubleclick.net/*', '*://*.googleadservices.com/*', '*://*.googlesyndication.com/*', '*://*.youtube.com/api/stats/ads*', '*://*.youtube.com/pagead/*', '*://*.youtube.com/ptracking*'] },
    (details, callback) => {
      callback({ cancel: true });
    }
  );
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.commandLine.appendSwitch('enable-experimental-web-platform-features')

let shareSourceId: string | null = null;

app.whenReady().then(() => {
  protocol.handle('watchparty', (request) => {
    let filePath = decodeURIComponent(request.url.replace('watchparty://local/', ''));
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1); // Remove leading slash for Windows paths
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
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
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

  createWindow();

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const source = sources.find(s => s.id === shareSourceId) || sources[0];
      callback({ video: source, audio: 'loopback' });
    });
  });
})

// IPC Handlers
ipcMain.handle('desktop:getSources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
});

ipcMain.handle('desktop:setSource', (event, id) => {
  shareSourceId = id;
});

ipcMain.handle('dialog:openFile', async () => {
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm'] }]
  })
  if (canceled) {
    return null
  } else {
    return filePaths[0]
  }
})

ipcMain.handle('media:getAudioTracks', async (event, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a',
      `"${filePath}"`
    ], { shell: true })
    
    let output = ''
    ffprobe.stdout.on('data', (data) => output += data.toString())
    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(output)
          resolve(parsed.streams || [])
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}`))
      }
    })
  })
})

ipcMain.handle('media:optimize', async (event, filePath: string, trackIndex?: number) => {
  return new Promise((resolve, reject) => {
    try {
      const parsed = path.parse(filePath)
      const outPath = path.join(parsed.dir, `${parsed.name}_watchparty.mp4`)

      const audioMapArgs = trackIndex !== undefined ? ['-map', `0:${trackIndex}`] : ['-map', '0:a']

      const ffmpeg = spawn('ffmpeg', [
        '-i', `"${filePath}"`,
        '-map', '0:v',
        ...audioMapArgs,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-sn', // Strip subtitles
        '-movflags', 'faststart',
        '-y', // Overwrite
        `"${outPath}"`
      ], { shell: true })

      let durationSecs = 0;

      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString()
        
        // Match Duration: HH:MM:SS.ms
        const durMatch = text.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
        if (durMatch) {
          durationSecs = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
        }

        // Match time=HH:MM:SS.ms
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (timeMatch && durationSecs > 0 && win) {
          const currentSecs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3])
          const percent = Math.min(100, Math.round((currentSecs / durationSecs) * 100))
          win.webContents.send('media:progress', percent)
        }
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outPath)
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`))
        }
      })
      
      ffmpeg.on('error', (err) => {
        reject(err)
      })
    } catch (err) {
      reject(err)
    }
  })
})
