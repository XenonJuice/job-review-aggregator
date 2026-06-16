import { CompanyAnalysis, CompanyReview } from '../domain/types';

// 搜索历史记录用于历史页和重复分析入口。
export interface SearchHistoryRecord {
  id: string;
  query: string;
  createdAt: string;
}

export interface AnalysisHistoryRecord {
  id: string;
  company: string;
  provider: string;
  createdAt: string;
  summary: string;
}

// Repository 接口隔离存储实现，生产桌面版使用 SQLite
export interface ReviewRepository {
  saveSearch(query: string): Promise<SearchHistoryRecord>;
  saveReviews(reviews: CompanyReview[]): Promise<void>;
  saveAnalysis(analysis: CompanyAnalysis): Promise<void>;
  listSearches(limit?: number): Promise<SearchHistoryRecord[]>;
  listAnalyses(limit?: number): Promise<AnalysisHistoryRecord[]>;
  clearAll?(): Promise<void>;
}
