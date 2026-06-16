import {
  CompanyReview,
  CompanySearchInput,
  CompanySearchResult,
  SiteId,
} from '../domain/types';

// 评论读取请求指定公司候选结果和分页上限。
export interface FetchReviewsRequest {
  company: CompanySearchResult;
  maxPages: number;
}

// 所有求职网站插件必须遵守的契约。
export interface JobReviewSitePlugin {
  // 插件元数据用于注册、筛选和前端展示。
  id: SiteId;
  displayName: string;

  // searchCompany 把统一搜索词转换为站点内公司候选列表。
  searchCompany(input: CompanySearchInput): Promise<CompanySearchResult[]>;

  // fetchCompanyReviews 读取站点公开可访问的评论；登录后完整评论由登录采集器导入。
  fetchCompanyReviews(request: FetchReviewsRequest): Promise<CompanyReview[]>;
}
