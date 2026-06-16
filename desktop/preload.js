const { contextBridge, ipcRenderer } = require('electron');
/**
 * preload.js 是 Electron 里的“桥接脚本”。
 * 它在网页前端加载之前执行，用来把主进程能力安全地暴露给前端页面。
 * */

contextBridge.exposeInMainWorld('jobReviewAggregator', {
  collectSiteReviews(input) {
    return ipcRenderer.invoke('collect-site-reviews', input);
  },// 这里的调用都是在app js里接住消息的
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
