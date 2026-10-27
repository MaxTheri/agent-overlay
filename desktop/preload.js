const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  snapshot: () => ipcRenderer.invoke('overlay:snapshot'),
  activate: (id) => ipcRenderer.invoke('overlay:activate', id),
  onState: (callback) => { const handler = (_event, state) => callback(state); ipcRenderer.on('overlay:state', handler); return () => ipcRenderer.removeListener('overlay:state', handler); },
  layout: (height, rects) => ipcRenderer.send('overlay:layout', { height, rects }),
  collapse: () => ipcRenderer.send('overlay:collapse'),
  dragStart: (x, y) => ipcRenderer.send('overlay:drag-start', { x, y }),
  dragMove: (x, y, buttons) => ipcRenderer.send('overlay:drag-move', { x, y, buttons }),
  dragStop: () => ipcRenderer.send('overlay:drag-stop'),
  onDragEnd: (callback) => ipcRenderer.on('overlay:drag-end', () => callback()),
  pointer: () => ipcRenderer.send('overlay:pointer'),
});
