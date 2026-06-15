import {
  CompanyReview,
  CompanySearchInput,
  CompanySearchResult,
  SiteId,
} from '../domain/types';
import { AuthMethod, BrowserSession } from '../browser/session';

// 登录请求把当前站点会话和用户可选认证方式交给插件。
export interface LoginRequest {
  session: BrowserSession;
  preferredAuthMethods: AuthMethod[];
}

// 评论读取请求指定公司候选结果和分页上限。
export interface FetchReviewsRequest {
  session: BrowserSession;
  company: CompanySearchResult;
  maxPages: number;
}

// 所有求职网站插件必须遵守的契约。
export interface JobReviewSitePlugin {
  // 插件元数据用于注册、筛选和前端展示。
  id: SiteId;
  displayName: string;
  supportedAuthMethods: readonly AuthMethod[];

  // login 必须通过真实浏览器流程完成或恢复登录状态。
  login(request: LoginRequest): Promise<BrowserSession>;

  // searchCompany 把统一搜索词转换为站点内公司候选列表。
  searchCompany(
    session: BrowserSession,
    input: CompanySearchInput,
  ): Promise<CompanySearchResult[]>;

  // fetchCompanyReviews 只读取用户登录后有权限查看的内容。
  fetchCompanyReviews(request: FetchReviewsRequest): Promise<CompanyReview[]>;
}
