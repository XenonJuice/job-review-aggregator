const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const JobTalkParser = require('../extension/parser');

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const JOBTALK_HOME_URL = 'https://jobtalk.jp/';
const LOCAL_IMPORT_URL = 'http://127.0.0.1:3000/api/imports/tenshoku-kaigi';
const BASE_URL = 'https://jobtalk.jp';

class LoginRequiredError extends Error {
  constructor() {
    super('请在弹出的転職会議窗口中完成登录。登录完成后会自动继续采集。');
  }
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 920,
    title: 'Japan Job Review AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  await window.loadURL(FRONTEND_URL);
}

async function openCollectorWindow(input) {
  const companyQuery = String(input?.companyQuery ?? '').trim();
  const maxPages = Number(input?.maxPages ?? 1);

  if (!companyQuery) {
    throw new Error('请输入公司名。');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error('页数必须是 1 到 10。');
  }

  try {
    return await collectAndImportReviews({ companyQuery, maxPages });
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
      title: '転職会議 登录读取',
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
      if (isJobTalkPage(window.webContents.getURL())) {
        void showCollectorStatus(
          window,
          '请在此窗口完成転職会議登录。登录后会自动继续搜索和读取评论。',
        );
      }
    });

    const timer = setInterval(() => {
      collectAndImportReviews({ companyQuery, maxPages })
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

    void window.loadURL(JOBTALK_HOME_URL).catch((error) => {
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

function isJobTalkPage(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname;
    return hostname === 'jobtalk.jp' || hostname.endsWith('.jobtalk.jp');
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

async function collectAndImportReviews({ companyQuery, maxPages }) {
  const searchData = await fetchNextData(
    `${BASE_URL}/companies/search?keyword=${encodeURIComponent(companyQuery)}`,
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
      `${BASE_URL}/companies/${company.id}/answers?page=${page}`,
    );

    if (!JobTalkParser.isLoggedIn(nextData)) {
      throw new LoginRequiredError();
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

  await importReviews({
    company: company.name,
    reviews,
  });

  return {
    company: company.name,
    reviewCount: reviews.length,
  };
}

async function fetchNextData(url) {
  const response = await session.defaultSession.fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`転職会議请求失败：HTTP ${response.status}`);
  }
  if (response.url.includes('sign_in')) {
    throw new LoginRequiredError();
  }

  return JobTalkParser.parseNextData(await response.text());
}

async function importReviews(payload) {
  const response = await fetch(LOCAL_IMPORT_URL, {
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

app.whenReady().then(() => {
  void createMainWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
