import { BrowserSession } from '../browser/session';
import { CompanyReview, CompanySearchInput, CompanySearchResult } from '../domain/types';
import { FetchReviewsRequest, JobReviewSitePlugin, LoginRequest } from './sitePlugin';

// 転職会議插件的稳定元数据，供插件注册表和前端网站选择使用。
const SITE_ID = 'tenshoku-kaigi';
const DISPLAY_NAME = '転職会議';

// MVP 占位插件：先固定边界，后续再替换为 Playwright 真实实现。
export class TenshokuKaigiPlugin implements JobReviewSitePlugin {
  readonly id = SITE_ID;
  readonly displayName = DISPLAY_NAME;
  readonly supportedAuthMethods = ['password', 'google-oauth', 'mfa'] as const;

  // 登录阶段后续会打开真实 Chromium，让用户自己完成账号、OAuth 或 MFA。
  async login(request: LoginRequest): Promise<BrowserSession> {
    return {
      ...request.session,
      restored: true,
    };
  }

  // 搜索阶段先返回目标站点搜索 URL，真实实现会解析公司候选页。
  async searchCompany(
    _session: BrowserSession,
    input: CompanySearchInput,
  ): Promise<CompanySearchResult[]> {
    const normalizedQuery = input.query.trim();

    if (!normalizedQuery) {
      return [];
    }

    return [
      {
        siteId: SITE_ID,
        companyName: normalizedQuery,
        companyUrl: `https://jobtalk.jp/companies/search?keyword=${encodeURIComponent(normalizedQuery)}`,
        confidence: 0.5,
      },
    ];
  }

  // 抓取阶段目前只返回占位评论，避免在未接入登录前误导性抓取。
  async fetchCompanyReviews(request: FetchReviewsRequest): Promise<CompanyReview[]> {
    if (request.maxPages < 1) {
      return [];
    }

    return [
      {
        company: request.company.companyName,
        source: DISPLAY_NAME,
        reviewType: 'company-review',
        title: 'MVP placeholder review',
        content:
          '転職会議 plugin boundary is ready. Replace this placeholder with Playwright extraction after real browser login is wired.',
        url: request.company.companyUrl,
        metadata: {
          compliance:
            'Use authenticated browser pages only. Do not bypass captcha, MFA, paywalls, or access controls.',
        },
      },
    ];
  }
}
