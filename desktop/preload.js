const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jobReviewAggregator', {
  isDesktop: true,
  collectTenshokuKaigi(input) {
    return ipcRenderer.invoke('collect-tenshoku-kaigi', input);
  },
  importReviews(payload) {
    return ipcRenderer.invoke('import-reviews', payload);
  },
  finishCollection(payload) {
    ipcRenderer.send('collection-finished', payload);
  },
  failCollection(payload) {
    ipcRenderer.send('collection-failed', payload);
  },
});
