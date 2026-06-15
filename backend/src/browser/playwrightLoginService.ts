import { chromium, BrowserContext } from 'playwright';
import { SiteId } from '../domain/types';
import { BrowserSessionStore } from './session';

export interface BrowserLoginResult {
  siteId: SiteId;
  status: 'opened' | 'focused';
}

export interface BrowserLoginService {
  open(siteId: SiteId): Promise<BrowserLoginResult>;
}

const SITE_HOME_URLS: Record<SiteId, string | undefined> = {
  'tenshoku-kaigi': 'https://jobtalk.jp/',
  openwork: undefined,
  lighthouse: undefined,
  careerconnection: undefined,
  green: undefined,
  wantedly: undefined,
  findy: undefined,
};

export class PlaywrightBrowserLoginService implements BrowserLoginService {
  // 保留已打开的上下文，重复点击网站选项时复用窗口而不是启动多个 Chromium。
  private readonly contexts = new Map<SiteId, BrowserContext>();

  constructor(private readonly sessions: BrowserSessionStore) {}

  async open(siteId: SiteId): Promise<BrowserLoginResult> {
    const existingContext = this.contexts.get(siteId);

    if (existingContext) {
      const page = existingContext.pages()[0] ?? (await existingContext.newPage());
      await page.bringToFront();
      return { siteId, status: 'focused' };
    }

    const homeUrl = SITE_HOME_URLS[siteId];

    if (!homeUrl) {
      throw new Error(`Browser login is not implemented for ${siteId}`);
    }

    const session = await this.sessions.restore(siteId);

    if (!session.profilePath) {
      throw new Error(`No browser profile path is configured for ${siteId}`);
    }

    // persistent context 会把 Cookie、LocalStorage 等登录状态写入该站点的 profile。
    const context = await chromium.launchPersistentContext(session.profilePath, {
      headless: false,
      viewport: null,
    });

    this.contexts.set(siteId, context);
    // 用户关闭浏览器后清理内存引用，并记录这份 profile 最近使用过。
    context.once('close', () => {
      this.contexts.delete(siteId);
      void this.sessions.persist({
        ...session,
        restored: true,
      });
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();

    return { siteId, status: 'opened' };
  }
}
