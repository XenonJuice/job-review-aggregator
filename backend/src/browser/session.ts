import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SiteId } from '../domain/types';

// 支持的登录方式只描述用户可走的真实认证流程，不包含绕过认证的路径。
export type AuthMethod = 'password' | 'google-oauth' | 'microsoft-oauth' | 'mfa';

// 浏览器会话代表某个站点的一份用户 profile。
export interface BrowserSession {
  siteId: SiteId;
  profileName: string;
  restored: boolean;
  profilePath?: string;
  updatedAt?: string;
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

// 文件系统会话存储记录每个站点的 profile 位置，为 Playwright 持久化浏览器做准备。
export class FileSystemBrowserSessionStore implements BrowserSessionStore {
  constructor(private readonly baseDir: string) {}

  // 从本地 JSON metadata 恢复会话；真实 cookie 和 localStorage 会由浏览器 profile 目录保存。
  async restore(siteId: SiteId): Promise<BrowserSession> {
    const profileName = `${siteId}-default`;
    const profilePath = path.join(this.baseDir, profileName);
    const metadataPath = this.getMetadataPath(siteId);

    await mkdir(profilePath, { recursive: true });

    try {
      const rawMetadata = await readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(rawMetadata) as BrowserSession;

      return {
        ...metadata,
        siteId,
        profileName,
        profilePath,
        restored: true,
      };
    } catch {
      return {
        siteId,
        profileName,
        profilePath,
        restored: false,
      };
    }
  }

  // 保存 metadata，后续 Playwright 接入时同一个 profilePath 会复用浏览器状态。
  async persist(session: BrowserSession): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });

    const updatedSession: BrowserSession = {
      ...session,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(
      this.getMetadataPath(session.siteId),
      `${JSON.stringify(updatedSession, null, 2)}\n`,
      'utf8',
    );
  }

  private getMetadataPath(siteId: SiteId): string {
    return path.join(this.baseDir, `${siteId}.session.json`);
  }
}
