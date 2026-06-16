const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const JOBTALK_HOME_URL = 'https://jobtalk.jp/';
const LOCAL_IMPORT_URL = 'http://127.0.0.1:3000/api/imports/tenshoku-kaigi';

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Job Review Aggregator Login Test',
    webPreferences: {
      preload: path.join(__dirname, 'electron-login-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 登录实验只验证 Electron 内置浏览器能否通过真实 OAuth，不读取页面数据。
  window.webContents.setWindowOpenHandler(({ url }) => {
    void window.loadURL(url).catch(() => undefined);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isHttpUrl(url)) {
      return;
    }

    // 实验阶段所有 HTTPS 登录跳转都留在 Electron，只把非网页协议交给系统处理。
    event.preventDefault();
    void shell.openExternal(url);
  });

  window.webContents.on('did-finish-load', () => {
    if (isJobTalkPage(window.webContents.getURL())) {
      void injectReviewImportPanel(window);
    }
  });

  await window.loadURL(JOBTALK_HOME_URL);
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

async function injectReviewImportPanel(window) {
  const parserSource = readFileSync(
    path.join(__dirname, '../extension/parser.js'),
    'utf8',
  );

  // 面板运行在転職会議页面上下文里，所以 fetch 会自动带上 Electron 中的登录 Cookie。
  await window.webContents.executeJavaScript(`
    ${parserSource}
    (() => {
      if (document.querySelector('#jra-electron-panel')) {
        return;
      }

      const panel = document.createElement('section');
      panel.id = 'jra-electron-panel';
      panel.innerHTML = \`
        <style>
          #jra-electron-panel {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            width: 310px;
            padding: 14px;
            border-radius: 12px;
            background: #172033;
            color: #fff;
            box-shadow: 0 14px 42px rgba(0,0,0,.28);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          #jra-electron-panel h2 {
            margin: 0 0 10px;
            font-size: 15px;
          }
          #jra-electron-panel label,
          #jra-electron-panel p {
            display: block;
            margin: 8px 0 5px;
            font-size: 12px;
            line-height: 1.5;
          }
          #jra-electron-panel input,
          #jra-electron-panel button {
            box-sizing: border-box;
            width: 100%;
            border: 0;
            border-radius: 7px;
            padding: 8px;
            font: inherit;
          }
          #jra-electron-panel button {
            margin-top: 10px;
            background: #57d98d;
            color: #0d2416;
            cursor: pointer;
            font-weight: 700;
          }
          #jra-electron-panel button:disabled {
            cursor: wait;
            opacity: .7;
          }
          #jra-electron-status {
            color: #dbe8ff;
            min-height: 32px;
          }
        </style>
        <h2>桌面登录读取测试</h2>
        <label>公司名</label>
        <input id="jra-electron-company" value="富士ソフト" />
        <label>读取页数</label>
        <input id="jra-electron-pages" type="number" min="1" max="10" value="1" />
        <button id="jra-electron-import">读取并导入本地后台</button>
        <p id="jra-electron-status">只读取这个 Electron 窗口当前登录账号可见的评论。</p>
      \`;
      document.body.append(panel);

      const button = panel.querySelector('#jra-electron-import');
      const status = panel.querySelector('#jra-electron-status');

      if (location.hostname !== 'jobtalk.jp') {
        button.textContent = '进入评论站点后读取';
        status.textContent = '当前是転職会議个人中心。请先进入 jobtalk.jp 主站，评论读取必须在主站页面执行。';
        button.addEventListener('click', () => {
          location.href = 'https://jobtalk.jp/';
        });
        return;
      }

      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '正在读取...';
        status.textContent = '正在用 Electron 当前登录态读取评论。';

        try {
          const companyQuery = panel.querySelector('#jra-electron-company').value.trim();
          const maxPages = Number(panel.querySelector('#jra-electron-pages').value);
          const result = await collectReviews(companyQuery, maxPages);
          await window.jobReviewAggregator.importReviews({
            company: result.company,
            reviews: result.reviews,
          });
          status.textContent = \`完成：\${result.company}，导入 \${result.reviews.length} 条评论。\`;
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          button.disabled = false;
          button.textContent = '读取并导入本地后台';
        }
      });

      async function collectReviews(companyQuery, maxPages) {
        if (!companyQuery) {
          throw new Error('请输入公司名。');
        }
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
          throw new Error('页数必须是 1 到 10。');
        }

        const searchData = await fetchNextData(
          \`/companies/search?keyword=\${encodeURIComponent(companyQuery)}\`,
        );
        const company = JobTalkParser.extractCompanyCandidates(searchData, companyQuery)[0];

        if (!company) {
          throw new Error(\`没有找到公司：\${companyQuery}\`);
        }

        const reviews = [];
        const seenIds = new Set();

        for (let page = 1; page <= maxPages; page += 1) {
          const nextData = await fetchNextData(
            \`/companies/\${company.id}/answers?page=\${page}\`,
          );
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
        }

        if (reviews.length === 0) {
          throw new Error('没有读取到可导入的评论。');
        }

        return { company: company.name, reviews };
      }

      async function fetchNextData(pathname) {
        const response = await fetch(pathname, {
          credentials: 'include',
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(\`転職会議请求失败：HTTP \${response.status}\`);
        }
        if (response.url.includes('sign_in')) {
          throw new Error('当前 Electron 窗口还没有転職会議登录态。');
        }

        return JobTalkParser.parseNextData(await response.text());
      }
    })();
  `);
}

ipcMain.handle('import-reviews', async (_event, payload) => {
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
});

app.whenReady().then(() => {
  void createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
