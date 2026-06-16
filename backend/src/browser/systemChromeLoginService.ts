import { spawn } from 'node:child_process';
import { SiteId } from '../domain/types';
import {
  BrowserLoginResult,
  BrowserLoginService,
} from './playwrightLoginService';

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
  async open(siteId: SiteId): Promise<BrowserLoginResult> {
    if (process.platform !== 'darwin') {
      throw new Error('System Chrome login is currently implemented for macOS');
    }

    const homeUrl = SITE_HOME_URLS[siteId];

    if (!homeUrl) {
      throw new Error(`Browser login is not implemented for ${siteId}`);
    }

    // 通过 macOS 打开日常使用的 Chrome，确保登录状态与已安装扩展位于同一用户目录。
    const chrome = spawn(
      'open',
      ['-a', 'Google Chrome', homeUrl],
      {
        detached: true,
        stdio: 'ignore',
      },
    );

    chrome.unref();

    return { siteId, status: 'opened' };
  }
}
