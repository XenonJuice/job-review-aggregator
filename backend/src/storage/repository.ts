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

// Repository 接口隔离存储实现，MVP 后续可从内存替换为 SQLite。
export interface ReviewRepository {
  saveSearch(query: string): Promise<SearchHistoryRecord>;
  saveReviews(reviews: CompanyReview[]): Promise<void>;
  saveAnalysis(analysis: CompanyAnalysis): Promise<void>;
  listSearches(limit?: number): Promise<SearchHistoryRecord[]>;
  listAnalyses(limit?: number): Promise<AnalysisHistoryRecord[]>;
}

// 内存 Repository 用于早期开发和单元测试，不提供跨进程持久化。
export class InMemoryReviewRepository implements ReviewRepository {
  // 这三组数组模拟未来 SQLite 中的 searches、reviews、analyses 表。
  readonly searches: SearchHistoryRecord[] = [];
  readonly reviews: CompanyReview[] = [];
  readonly analyses: CompanyAnalysis[] = [];

  // 保存搜索词并生成一个简单 ID。
  async saveSearch(query: string): Promise<SearchHistoryRecord> {
    const record = {
      id: `${Date.now()}-${this.searches.length + 1}`,
      query,
      createdAt: new Date().toISOString(),
    };

    this.searches.push(record);
    return record;
  }

  // 批量保存标准化评论。
  async saveReviews(reviews: CompanyReview[]): Promise<void> {
    this.reviews.push(...reviews);
  }

  // 保存一次 AI 分析结果。
  async saveAnalysis(analysis: CompanyAnalysis): Promise<void> {
    this.analyses.push(analysis);
  }

  async listSearches(limit = 20): Promise<SearchHistoryRecord[]> {
    return this.searches.slice(-limit).reverse();
  }

  async listAnalyses(limit = 20): Promise<AnalysisHistoryRecord[]> {
    return this.analyses.slice(-limit).reverse().map((analysis, index) => {
      return {
        id: `${index + 1}`,
        company: analysis.company,
        provider: analysis.provider,
        createdAt: new Date().toISOString(),
        summary: analysis.overallSummary,
      };
    });
  }
}
