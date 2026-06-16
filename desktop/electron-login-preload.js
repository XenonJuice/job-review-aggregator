const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jobReviewAggregator', {
  importReviews(payload) {
    return ipcRenderer.invoke('import-reviews', payload);
  },
});
