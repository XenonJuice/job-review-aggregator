import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { SiteId } from '../domain/types';
import {
  BrowserLoginResult,
  BrowserLoginService,
} from './playwrightLoginService';
import { BrowserSessionStore } from './session';

const GOOGLE_CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SITE_HOME_URLS: Record<SiteId, string | undefined> = {
  'tenshoku-kaigi': 'https://jobtalk.jp/',
  openwork: undefined,
  lighthouse: undefined,
  careerconnection: undefined,
  green: undefined,
  wantedly: undefined,
  findy: undefined,
};

// Google OAuth 在自动化浏览器中可能被拒绝，因此登录阶段使用不受 Playwright 控制的普通 Chrome。
export class SystemChromeLoginService implements BrowserLoginService {
  constructor(private readonly sessions: BrowserSessionStore) {}

  async open(siteId: SiteId): Promise<BrowserLoginResult> {
    if (process.platform !== 'darwin') {
      throw new Error('System Chrome login is currently implemented for macOS');
    }

    const homeUrl = SITE_HOME_URLS[siteId];

    if (!homeUrl) {
      throw new Error(`Browser login is not implemented for ${siteId}`);
    }

    const session = await this.sessions.restore(siteId);

    if (!session.profilePath) {
      throw new Error(`No browser profile path is configured for ${siteId}`);
    }

    await access(GOOGLE_CHROME_PATH);

    // 使用项目专用 profile 启动正常 Chrome；登录后 Cookie 会留在该目录供后续抓取复用。
    const chrome = spawn(
      GOOGLE_CHROME_PATH,
      [
        `--user-data-dir=${session.profilePath}`,
        '--no-first-run',
        '--no-default-browser-check',
        homeUrl,
      ],
      {
        detached: true,
        stdio: 'ignore',
      },
    );

    chrome.unref();
    await this.sessions.persist({
      ...session,
      restored: true,
    });

    return { siteId, status: 'opened' };
  }
}
