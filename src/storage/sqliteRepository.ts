import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CompanyAnalysis, CompanyReview } from '../domain/types';
import {
  AnalysisHistoryRecord,
  ReviewRepository,
  SearchHistoryRecord,
} from './repository';

type SearchRow = {
  id: number;
  query: string;
  created_at: string;
};

type AnalysisRow = {
  id: number;
  display_name: string;
  provider: string;
  created_at: string;
  overall_summary: string;
};

// SQLiteRepository 是当前本地应用的真实持久化实现。
export class SQLiteReviewRepository implements ReviewRepository {
  private readonly db: DatabaseSync;

  constructor(
    private readonly dbPath: string,
    schemaPath = path.resolve('src/storage/schema.sql'),
  ) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(readFileSync(schemaPath, 'utf8'));
  }

  // 保存一次搜索历史。
  async saveSearch(query: string): Promise<SearchHistoryRecord> {
    const result = this.db.prepare('INSERT INTO searches (query) VALUES (?)').run(query);
    const row = this.db
      .prepare('SELECT id, query, created_at FROM searches WHERE id = ?')
      .get(result.lastInsertRowid) as SearchRow;

    return mapSearchRow(row);
  }

  // 保存标准化评论，同时自动创建公司主数据。
  async saveReviews(reviews: CompanyReview[]): Promise<void> {
    const insertReview = this.db.prepare(`
      INSERT INTO reviews (
        company_id,
        source,
        review_type,
        title,
        content,
        rating_json,
        posted_at,
        url,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const review of reviews) {
      const companyId = this.getOrCreateCompanyId(review.company);

      insertReview.run(
        companyId,
        review.source,
        review.reviewType,
        review.title,
        review.content,
        review.rating ? JSON.stringify(review.rating) : null,
        review.postedAt ?? null,
        review.url ?? null,
        review.metadata ? JSON.stringify(review.metadata) : null,
      );
    }
  }

  // 保存 AI 分析结果。
  async saveAnalysis(analysis: CompanyAnalysis): Promise<void> {
    const companyId = this.getOrCreateCompanyId(analysis.company);

    this.db
      .prepare(
        `
        INSERT INTO analyses (
          company_id,
          provider,
          sources_json,
          overall_summary,
          interview_summary,
          technology_summary,
          risk_summary,
          foreigner_perspective,
          preparation_advice,
          raw_provider_output
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        companyId,
        analysis.provider,
        JSON.stringify(analysis.sources),
        analysis.overallSummary,
        analysis.interviewSummary,
        analysis.technologySummary,
        analysis.riskSummary,
        analysis.foreignerPerspective,
        analysis.preparationAdvice,
        analysis.rawProviderOutput,
      );
  }

  // 最近搜索记录用于前端历史栏。
  async listSearches(limit = 20): Promise<SearchHistoryRecord[]> {
    const rows = this.db
      .prepare('SELECT id, query, created_at FROM searches ORDER BY id DESC LIMIT ?')
      .all(limit) as SearchRow[];

    return rows.map(mapSearchRow);
  }

  // 最近分析记录用于前端历史栏。
  async listAnalyses(limit = 20): Promise<AnalysisHistoryRecord[]> {
    const rows = this.db
      .prepare(
        `
        SELECT
          analyses.id,
          companies.display_name,
          analyses.provider,
          analyses.created_at,
          analyses.overall_summary
        FROM analyses
        JOIN companies ON companies.id = analyses.company_id
        ORDER BY analyses.id DESC
        LIMIT ?
      `,
      )
      .all(limit) as AnalysisRow[];

    return rows.map((row) => {
      return {
        id: String(row.id),
        company: row.display_name,
        provider: row.provider,
        createdAt: row.created_at,
        summary: row.overall_summary,
      };
    });
  }

  private getOrCreateCompanyId(displayName: string): number {
    const normalizedName = normalizeCompanyName(displayName);
    const existing = this.db
      .prepare('SELECT id FROM companies WHERE normalized_name = ?')
      .get(normalizedName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const result = this.db
      .prepare('INSERT INTO companies (normalized_name, display_name) VALUES (?, ?)')
      .run(normalizedName, displayName);

    return Number(result.lastInsertRowid);
  }
}

function normalizeCompanyName(displayName: string): string {
  return displayName.trim().toLocaleLowerCase('ja-JP');
}

function mapSearchRow(row: SearchRow): SearchHistoryRecord {
  return {
    id: String(row.id),
    query: row.query,
    createdAt: row.created_at,
  };
}
