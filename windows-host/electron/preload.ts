import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  
  // Custom APIs
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  getAudioTracks: (filePath: string) => ipcRenderer.invoke('media:getAudioTracks', filePath),
  optimizeAudio: (filePath: string, trackIndex?: number) => ipcRenderer.invoke('media:optimize', filePath, trackIndex),
  getDesktopSources: () => ipcRenderer.invoke('desktop:getSources'),
  setDesktopSource: (id: string) => ipcRenderer.invoke('desktop:setSource', id),
  onMediaProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('media:progress', (_event, progress) => callback(progress))
  }
})
