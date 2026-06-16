const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const express = require('express');
const path = require('node:path');
const JobTalkParser = require('./jobtalkParser');

const FRONTEND_URL = process.env.FRONTEND_URL;
const SITES = {
  'tenshoku-kaigi': {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    baseUrl: 'https://jobtalk.jp',
    homeUrl: 'https://jobtalk.jp/',
    importPath: '/api/imports/tenshoku-kaigi',
  },
};
const DEFAULT_SITE = SITES['tenshoku-kaigi'];
let localImportUrl = `http://127.0.0.1:3000${DEFAULT_SITE.importPath}`;
let mainWindow;
let integratedListener;
let activeRepository;

class LoginRequiredError extends Error {
  constructor(site = DEFAULT_SITE) {
    super(`请在弹出的${site.displayName}窗口中完成登录。登录完成后会自动继续采集。`);
  }
}

async function createMainWindow() {
  const frontendUrl = FRONTEND_URL ?? (await startIntegratedServer());
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    title: 'Japan Job Review AI',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  await mainWindow.loadURL(frontendUrl);
}

async function startIntegratedServer() {
  const { MockAiProvider } = require('../dist/backend/ai/providers/mockAiProvider');
  const {
    ImportedReviewWorkflow,
  } = require('../dist/backend/app/importedReviewWorkflow');
  const { MvpWorkflow } = require('../dist/backend/app/mvpWorkflow');
  const { createApiApp } = require('../dist/backend/server/app');
  const {
    TenshokuKaigiPlugin,
  } = require('../dist/backend/sites/tenshokuKaigi');
  const {
    SQLiteReviewRepository,
  } = require('../dist/backend/storage/sqliteRepository');

  const server = express();
  const userDataPath = app.getPath('userData');
  const schemaPath = path.join(__dirname, '../backend/src/storage/schema.sql');
  const repository = new SQLiteReviewRepository(
    path.join(userDataPath, 'app.sqlite'),
    schemaPath,
  );
  activeRepository = repository;
  const aiProvider = new MockAiProvider();
  const workflow = new MvpWorkflow(
    [new TenshokuKaigiPlugin()],
    repository,
    aiProvider,
  );
  const importedReviewWorkflow = new ImportedReviewWorkflow(
    repository,
    aiProvider,
  );

  server.use(
    createApiApp({
      workflow,
      importedReviewWorkflow,
      repository,
    }),
  );
  server.use(express.static(path.join(__dirname, '../dist/frontend')));
  server.use((_request, response) => {
    response.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
  });

  const address = await new Promise((resolve) => {
    integratedListener = server.listen(0, '127.0.0.1', () => {
      resolve(integratedListener.address());
    });
  });

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start integrated desktop server');
  }

  localImportUrl = `http://127.0.0.1:${address.port}${DEFAULT_SITE.importPath}`;
  return `http://127.0.0.1:${address.port}`;
}

async function openCollectorWindow(input) {
  const site = DEFAULT_SITE;
  const companyQuery = String(input?.companyQuery ?? '').trim();
  const maxPages = Number(input?.maxPages ?? 1);

  if (!companyQuery) {
    throw new Error('请输入公司名。');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error('页数必须是 1 到 10。');
  }

  try {
    return await collectAndImportReviews({ site, companyQuery, maxPages });
  } catch (error) {
    if (!(error instanceof LoginRequiredError)) {
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const window = new BrowserWindow({
      width: 1280,
      height: 900,
      title: `${site.displayName} 登录读取`,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      void window.loadURL(url).catch(() => undefined);
      return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
      if (isHttpUrl(url)) {
        return;
      }

      // 桌面采集窗口保留网页登录跳转，只把非网页协议交给系统处理。
      event.preventDefault();
      void shell.openExternal(url);
    });

    window.webContents.on('did-finish-load', () => {
      if (isSitePage(site, window.webContents.getURL())) {
        // 登录提示使用当前站点 displayName，避免新增网站时残留硬编码文案。
        void showCollectorStatus(
          window,
          `请在此窗口完成${site.displayName}登录。登录后会自动继续搜索和读取评论。`,
        );
      }
    });

    const timer = setInterval(() => {
      collectAndImportReviews({ site, companyQuery, maxPages })
        .then((result) => {
          settled = true;
          clearInterval(timer);
          resolve(result);
          window.close();
        })
        .catch((error) => {
          if (error instanceof LoginRequiredError) {
            return;
          }

          clearInterval(timer);
          void showCollectorStatus(
            window,
            error instanceof Error ? error.message : String(error),
          );
          settled = true;
          reject(error);
        });
    }, 3_000);

    window.once('closed', () => {
      clearInterval(timer);
      if (!settled) {
        reject(new Error('采集窗口已关闭。'));
      }
    });

    void window.loadURL(site.homeUrl).catch((error) => {
      if (!isNavigationAbort(error)) {
        settled = true;
        reject(error);
      }
    });
  });
}

function isNavigationAbort(error) {
  return error instanceof Error && error.message.includes('ERR_ABORTED');
}

function isHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSitePage(site, rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname;
    const siteHostname = new URL(site.baseUrl).hostname;
    return hostname === siteHostname || hostname.endsWith(`.${siteHostname}`);
  } catch {
    return false;
  }
}

async function showCollectorStatus(window, message) {
  const safeMessage = JSON.stringify(message);

  await window.webContents.executeJavaScript(`
    (() => {
      const existingPanel = document.querySelector('#jra-desktop-panel');

      if (existingPanel) {
        existingPanel.querySelector('#jra-desktop-status').textContent = ${safeMessage};
        return;
      }

      const panel = document.createElement('section');
      panel.id = 'jra-desktop-panel';
      panel.innerHTML = \`
        <style>
          #jra-desktop-panel {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            width: 320px;
            padding: 14px;
            border-radius: 12px;
            background: #172033;
            color: #fff;
            box-shadow: 0 14px 42px rgba(0,0,0,.28);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          #jra-desktop-panel h2 {
            margin: 0 0 10px;
            font-size: 15px;
          }
          #jra-desktop-panel p {
            margin: 8px 0 0;
            font-size: 12px;
            line-height: 1.5;
          }
          #jra-desktop-status {
            color: #dbe8ff;
            min-height: 32px;
          }
        </style>
        <h2>自动读取登录后评论</h2>
        <p id="jra-desktop-status"></p>
      \`;
      document.body.append(panel);
      panel.querySelector('#jra-desktop-status').textContent = ${safeMessage};
    })();
  `);
}

async function collectAndImportReviews({ site, companyQuery, maxPages }) {
  const searchData = await fetchNextData(
    `${site.baseUrl}/companies/search?keyword=${encodeURIComponent(companyQuery)}`,
    site,
  );
  const company = JobTalkParser.extractCompanyCandidates(
    searchData,
    companyQuery,
  )[0];

  if (!company) {
    throw new Error(`没有找到公司：${companyQuery}`);
  }

  const reviews = [];
  const seenIds = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const nextData = await fetchNextData(
      `${site.baseUrl}/companies/${company.id}/answers?page=${page}`,
      site,
    );

    if (!JobTalkParser.isLoggedIn(nextData)) {
      throw new LoginRequiredError(site);
    }

    const answers = JobTalkParser.extractAnswerNodes(nextData);

    if (answers.length === 0) {
      break;
    }

    for (const review of JobTalkParser.mapAnswersToReviews(
      answers,
      company.name,
      company.id,
    )) {
      if (!seenIds.has(review.externalId)) {
        seenIds.add(review.externalId);
        const { externalId, ...importedReview } = review;
        reviews.push(importedReview);
      }
    }

    if (page < maxPages) {
      await delay(600);
    }
  }

  if (reviews.length === 0) {
    throw new Error('没有读取到可导入的评论。');
  }

  const imported = await importReviews({
    company: company.name,
    reviews,
  });

  return {
    company: company.name,
    reviewCount: reviews.length,
    reviews: imported.reviews,
    analysis: imported.analysis,
  };
}

async function fetchNextData(url, site = DEFAULT_SITE) {
  const response = await session.defaultSession.fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`${site.displayName}请求失败：HTTP ${response.status}`);
  }
  if (response.url.includes('sign_in')) {
    throw new LoginRequiredError(site);
  }

  return JobTalkParser.parseNextData(await response.text());
}

async function importReviews(payload) {
  const response = await fetch(localImportUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? `本地后台导入失败：HTTP ${response.status}`);
  }

  return body;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

ipcMain.handle('collect-tenshoku-kaigi', (_event, input) => {
  return openCollectorWindow(input);
});

ipcMain.handle('import-reviews', async (_event, payload) => {
  return importReviews(payload);
});

ipcMain.handle('get-settings', () => {
  return readSettings();
});

ipcMain.handle('save-settings', (_event, settings) => {
  const nextSettings = sanitizeSettings(settings);
  writeFileSync(getSettingsPath(), `${JSON.stringify(nextSettings, null, 2)}\n`);
  return nextSettings;
});

ipcMain.handle('clear-login-cache', async () => {
  await session.defaultSession.clearStorageData({
    storages: [
      'cookies',
      'localstorage',
      'indexdb',
      'cachestorage',
      'serviceworkers',
    ],
  });
  await session.defaultSession.clearCache();
  return { ok: true };
});

ipcMain.handle('clear-database', async (_event, confirmText) => {
  if (confirmText !== '清除数据库') {
    throw new Error('确认文本不正确。');
  }
  const repository = activeRepository ?? createDevelopmentRepository();

  if (!repository?.clearAll) {
    throw new Error('数据库尚未初始化。');
  }

  await repository.clearAll();
  return { ok: true };
});

app.setName('Job Review Aggregator');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createMainWindow().catch((error) => {
    logStartupError(error);
    app.quit();
  });
});

app.on('activate', () => {
  if (!mainWindow) {
    createMainWindow().catch((error) => {
      logStartupError(error);
      app.quit();
    });
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

function logStartupError(error) {
  const logPath = path.join(app.getPath('userData'), 'startup-error.log');
  const message = error instanceof Error ? error.stack ?? error.message : String(error);

  appendFileSync(logPath, `${new Date().toISOString()}\n${message}\n\n`);
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return {
      aiProvider: 'mock',
      apiKey: '',
      baseUrl: '',
      model: '',
    };
  }

  try {
    return sanitizeSettings(JSON.parse(readFileSync(settingsPath, 'utf8')));
  } catch {
    return {
      aiProvider: 'mock',
      apiKey: '',
      baseUrl: '',
      model: '',
    };
  }
}

function sanitizeSettings(settings) {
  return {
    aiProvider: typeof settings?.aiProvider === 'string' ? settings.aiProvider : 'mock',
    apiKey: typeof settings?.apiKey === 'string' ? settings.apiKey : '',
    baseUrl: typeof settings?.baseUrl === 'string' ? settings.baseUrl : '',
    model: typeof settings?.model === 'string' ? settings.model : '',
  };
}

function createDevelopmentRepository() {
  if (!FRONTEND_URL) {
    return undefined;
  }

  const {
    SQLiteReviewRepository,
  } = require('../dist/backend/storage/sqliteRepository');

  return new SQLiteReviewRepository(
    path.resolve('data/app.sqlite'),
    path.resolve('backend/src/storage/schema.sql'),
  );
}
