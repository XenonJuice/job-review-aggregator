import { SiteId } from '../domain/types';

// 支持的登录方式只描述用户可走的真实认证流程，不包含绕过认证的路径。
export type AuthMethod = 'password' | 'google-oauth' | 'microsoft-oauth' | 'mfa';

// 浏览器会话代表某个站点的一份用户 profile。
export interface BrowserSession {
  siteId: SiteId;
  profileName: string;
  restored: boolean;
}

// 会话存储接口隔离具体实现，后续可以替换为 Playwright 持久化目录。
export interface BrowserSessionStore {
  restore(siteId: SiteId): Promise<BrowserSession>;
  persist(session: BrowserSession): Promise<void>;
}

// MVP 阶段使用内存实现，方便先验证业务编排和类型边界。
export class InMemoryBrowserSessionStore implements BrowserSessionStore {
  private readonly sessions = new Map<SiteId, BrowserSession>();

  // 恢复已有会话；如果不存在，就返回一个未恢复的新 profile 描述。
  async restore(siteId: SiteId): Promise<BrowserSession> {
    const existing = this.sessions.get(siteId);

    if (existing) {
      return { ...existing, restored: true };
    }

    return {
      siteId,
      profileName: `${siteId}-default`,
      restored: false,
    };
  }

  // 登录成功后保存会话状态；真实实现会保存 cookie/localStorage/profile。
  async persist(session: BrowserSession): Promise<void> {
    this.sessions.set(session.siteId, { ...session, restored: true });
  }
}
