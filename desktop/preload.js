const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jobReviewAggregator', {
  isDesktop: true,
  collectSiteReviews(input) {
    return ipcRenderer.invoke('collect-site-reviews', input);
  },
  collectTenshokuKaigi(input) {
    return ipcRenderer.invoke('collect-site-reviews', {
      ...input,
      siteId: 'tenshoku-kaigi',
    });
  },
  importReviews(payload) {
    return ipcRenderer.invoke('import-reviews', payload);
  },
  getSettings() {
    return ipcRenderer.invoke('get-settings');
  },
  saveSettings(settings) {
    return ipcRenderer.invoke('save-settings', settings);
  },
  clearLoginCache() {
    return ipcRenderer.invoke('clear-login-cache');
  },
  clearDatabase(confirmText) {
    return ipcRenderer.invoke('clear-database', confirmText);
  },
  finishCollection(payload) {
    ipcRenderer.send('collection-finished', payload);
  },
  failCollection(payload) {
    ipcRenderer.send('collection-failed', payload);
  },
});
