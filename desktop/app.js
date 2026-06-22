const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const express = require('express');
const path = require('node:path');
const JobTalkParser = require('./jobtalkParser');

const FRONTEND_URL = process.env.FRONTEND_URL;
// todo 添加其他站点
const TARGET_REVIEW_SITES = {
  'tenshoku-kaigi': {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    baseUrl: 'https://jobtalk.jp',
    homeUrl: 'https://jobtalk.jp/',
    loginCheckUrl: 'https://jobtalk.jp/companies/2513/answers?page=1',
    parser: JobTalkParser,
  },
};
let localApiBaseUrl = 'http://127.0.0.1:3000';
let mainWindow;
let integratedListener;
let activeRepository;

class LoginRequiredError extends Error {
  constructor(site) {
    super(`请在弹出的${site.displayName}窗口中完成登录。登录完成后会自动继续采集。`);
  }
}

app.setName('Job Review Aggregator');

// 尝试获取单实例锁，
// 防止同一个electron app同时开多个进程实例导致状态混乱
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  registerIpcHandlers();
  registerAppLifecycleHandlers();
}

/**
 * 注册 Electron 主进程的生命周期事件。
 * - second-instance：重复启动应用时，唤起并聚焦已存在的主窗口
 * - whenReady：应用初始化完成后创建主窗口
 * - activate：应用被重新激活时，创建或聚焦主窗口
 * - window-all-closed：所有窗口关闭后退出应用
 */
function registerAppLifecycleHandlers() {
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
}

/**
 * 注册渲染进程可调用的 IPC 处理器。
 * IPC 处理器是 Electron 主进程里“接收前端请求并执行对应操作”的函数。
 * - ensure-site-logins：按传入的 siteIds 依次确认站点登录状态
 * - get-settings / save-settings：读取和保存本地设置
 * - clear-login-cache：清除 Electron 会话中的登录缓存
 * - clear-database：校验确认文本后清空本地数据库
 */
function registerIpcHandlers() {
  ipcMain.handle('ensure-site-logins', (_event, input) => {
    return ensureSiteLogins(input);
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
  const { ImportedReviewWorkflow } = require('../dist/backend/app/importedReviewWorkflow');
  const { MvpWorkflow } = require('../dist/backend/app/mvpWorkflow');
  const { createApiApp } = require('../dist/backend/server/app');
  const { createSitePlugins } = require('../dist/backend/sites/siteRegistry');
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
    createSitePlugins(),
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

  localApiBaseUrl = `http://127.0.0.1:${address.port}`;
  return localApiBaseUrl;
}

/**
 * 只确认所选站点的登录状态，不采集评论也不导入数据。
 * 已登录的站点会直接跳过；未登录的站点会依次打开登录窗口，等待用户完成登录。
 * 返回 { siteResults }，每项包含站点 ID、展示名称、登录状态，以及本次是否打开过登录窗口。
 */
async function ensureSiteLogins(input) {
  const targetSites = getTargetSites(input?.siteIds);
  const siteResults = [];

  for (const site of targetSites) {
    const alreadyLoggedIn = await isSiteLoggedIn(site);

    if (!alreadyLoggedIn) {
      await openSiteLoginWindow(site);
    }

    siteResults.push({
      siteId: site.id,
      displayName: site.displayName,
      loggedIn: true,
      openedLoginWindow: !alreadyLoggedIn,
    });
  }

  return { siteResults };
}

/**
 * 按前端传入的站点列表采集登录后完整评论，并统一导入本地后台。
 * 当前没有暴露给页面按钮；保留给后续真正接入“登录后完整评论采集”时复用。
 * 每个站点会先尝试复用已有登录状态；未登录时交给 collectReviewsWithLogin 打开登录窗口。
 * 返回值包含合并后的评论、分析结果，以及各站点本次采集到的评论数量。
 */
async function collectAndImportSiteReviews(input) {
  const targetSites = getTargetSites(input?.siteIds ?? input?.siteId);
  const companyQuery = String(input?.companyQuery ?? '').trim();
  const maxPages = Number(input?.maxPages ?? 1);

  if (!companyQuery) {
    throw new Error('请输入公司名。');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error('页数必须是 1 到 10。');
  }

  const siteReviewResults = [];

  for (const site of targetSites) {
    siteReviewResults.push(
      await collectReviewsWithLogin({ site, companyQuery, maxPages }),
    );
  }

  const company = siteReviewResults[0]?.company ?? companyQuery;
  const siteImports = siteReviewResults.map((siteReviewResult) => ({
    siteId: siteReviewResult.site.id,
    reviews: siteReviewResult.reviews,
  }));
  const reviewCount = siteImports.reduce(
    (total, siteImport) => total + siteImport.reviews.length,
    0,
  );
  const importResult = await importSiteReviewBatch({
    company,
    siteImports,
  });

  return {
    company,
    reviewCount,
    reviews: importResult.reviews,
    analysis: importResult.analysis,
    siteResults: siteReviewResults.map((siteReviewResult) => ({
      siteId: siteReviewResult.site.id,
      displayName: siteReviewResult.site.displayName,
      company: siteReviewResult.company,
      reviewCount: siteReviewResult.reviews.length,
    })),
  };
}

async function isSiteLoggedIn(site) {
  try {
    const nextData = await fetchSiteNextData(
      site.loginCheckUrl ?? site.homeUrl,
      site,
    );
    return site.parser.isLoggedIn(nextData);
  } catch (error) {
    if (error instanceof LoginRequiredError) {
      return false;
    }
    throw error;
  }
}

async function openSiteLoginWindow(site) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const window = new BrowserWindow({
      width: 1280,
      height: 900,
      title: `${site.displayName} 登录确认`,
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

      event.preventDefault();
      void shell.openExternal(url);
    });

    window.webContents.on('did-finish-load', () => {
      if (isSitePage(site, window.webContents.getURL())) {
        void showLoginWindowStatus(
          window,
          `请在此窗口完成${site.displayName}登录。登录完成后会自动继续检查下一个网站。`,
        );
      }
    });

    const timer = setInterval(() => {
      isSiteLoggedIn(site)
        .then((loggedIn) => {
          if (!loggedIn) {
            return;
          }

          settled = true;
          clearInterval(timer);
          resolve();
          window.close();
        })
        .catch((error) => {
          clearInterval(timer);
          void showLoginWindowStatus(
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
        reject(new Error('登录窗口已关闭。'));
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

/**
 * 采集单个站点的登录后完整评论。
 * 先直接使用当前 Electron session 里的登录状态采集；如果站点要求登录，
 * 则打开该站点登录窗口，并每 3 秒重试一次采集，直到成功、报错或窗口被关闭。
 */
async function collectReviewsWithLogin({ site, companyQuery, maxPages }) {
  try {
    return await collectReviewsFromSite({ site, companyQuery, maxPages });
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

      // 采集窗口保留网页登录跳转，只把非网页协议交给系统处理。
      event.preventDefault();
      void shell.openExternal(url);
    });

    window.webContents.on('did-finish-load', () => {
      if (isSitePage(site, window.webContents.getURL())) {
        // 登录提示使用当前站点 displayName，避免新增网站时残留硬编码文案。
        void showLoginWindowStatus(
          window,
          `请在此窗口完成 ${site.displayName} 的登录。登录后本页面会自动关闭，请返回上层页面开始操作。`,
        );
      }
    });

    const timer = setInterval(() => {
      collectReviewsFromSite({ site, companyQuery, maxPages })
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
          void showLoginWindowStatus(
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

/**
 * 从单个站点读取公司完整评论。
 * 负责搜索最匹配的公司、按页读取评论数据、校验登录状态，并用 externalId 去重。
 * 返回的 reviews 已去掉采集器内部使用的 externalId，可直接提交给后端导入。
 */
async function collectReviewsFromSite({ site, companyQuery, maxPages }) {
  const parser = site.parser;
  const searchData = await fetchSiteNextData(
    // TODO: 当前 URL 模板仍按転職会議页面结构拼接，新增站点时应下沉到站点配置或 parser。
    `${site.baseUrl}/companies/search?keyword=${encodeURIComponent(companyQuery)}`,
    site,
  );
  const company = parser.extractCompanyCandidates(
    searchData,
    companyQuery,
  )[0];

  if (!company) {
    throw new Error(`没有找到公司：${companyQuery}`);
  }

  const reviews = [];
  const seenIds = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const nextData = await fetchSiteNextData(
      `${site.baseUrl}/companies/${company.id}/answers?page=${page}`,
      site,
    );

    if (!parser.isLoggedIn(nextData)) {
      throw new LoginRequiredError(site);
    }

    const answers = parser.extractAnswerNodes(nextData);

    if (answers.length === 0) {
      break;
    }

    for (const review of parser.mapAnswersToReviews(
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

  return {
    site,
    company: company.name,
    reviews,
  };
}

async function fetchSiteNextData(url, site) {
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

  return site.parser.parseNextData(await response.text());
}

async function showLoginWindowStatus(window, message) {
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
        <h2>登录状态确认</h2>
        <p id="jra-desktop-status"></p>
      \`;
      document.body.append(panel);
      panel.querySelector('#jra-desktop-status').textContent = ${safeMessage};
    })();
  `);
}

/**
 * 将前端传入的站点 ID 转成本次需要采集的目标站点列表。
 * 支持单个 siteId 或 siteIds 数组；会去掉空值、去重，并校验站点是否已接入登录状态检查。
 */
function getTargetSites(siteIds) {
  const rawSiteIds = Array.isArray(siteIds) ? siteIds : [siteIds];
  const normalizedSiteIds = rawSiteIds
    .map((siteId) => String(siteId ?? '').trim())
    .filter(Boolean);

  if (normalizedSiteIds.length === 0) {
    throw new Error('请选择评价网站。');
  }

  return Array.from(new Set(normalizedSiteIds)).map((siteId) =>
    getTargetSite(siteId),
  );
}

function getTargetSite(siteId) {
  const normalizedSiteId = String(siteId ?? '').trim();
  if (!normalizedSiteId) {
    throw new Error('请选择评价网站。');
  }
  const site = TARGET_REVIEW_SITES[normalizedSiteId];
  if (!site) {
    throw new Error(`暂不支持该网站的登录状态检查：${normalizedSiteId}`);
  }
  return site;
}

async function importSiteReviewBatch(payload) {
  const response = await fetch(`${localApiBaseUrl}/api/imports`, {
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 将启动阶段捕获到的异常写入 Electron userData 目录下的 startup-error.log。
 * 优先记录错误堆栈，便于排查主窗口创建或内置服务启动失败的原因。
 *
 * @param {unknown} error 启动过程中捕获到的异常或错误信息。
 */
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
