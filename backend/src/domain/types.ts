// 站点 ID 是站点配置的稳定标识，后续新增网站时优先扩展这里。
export type SiteId =
  | 'tenshoku-kaigi'
  | 'openwork'
  | 'lighthouse'
  | 'careerconnection'
  | 'green'
  | 'wantedly'
  | 'findy';

// 评论类型用于把不同网站的原始栏目统一映射到内部分析维度。
export type ReviewType =
  | 'company-review'
  | 'interview'
  | 'work-environment'
  | 'technology'
  | 'foreigner'
  | 'salary'
  | 'exit-reason';

// 评分字段按内部维度保存，缺失项保持 undefined。
export interface ReviewRating {
  overall?: number;
  salary?: number;
  workLifeBalance?: number;
  culture?: number;
}

// 标准化评论结构，所有站点抓取结果都要转换成这个格式。
export interface CompanyReview {
  company: string;
  source: string;
  reviewType: ReviewType;
  title: string;
  content: string;
  rating?: ReviewRating;
  postedAt?: string;
  url?: string;
  metadata?: Record<string, string>;
}

// AI 分析结果结构，前端报告页和导出功能都围绕这个对象渲染。
export interface CompanyAnalysis {
  company: string;
  provider: string;
  sources: string[];
  overallSummary: string;
  interviewSummary: string;
  technologySummary: string;
  riskSummary: string;
  foreignerPerspective: string;
  preparationAdvice: string;
  rawProviderOutput: string;
}

// 评论采集/导入完成后返回给前端的标准分析结果。
export interface CompanyReviewAnalysisResult {
  reviews: CompanyReview[];
  analysis: CompanyAnalysis;
}
