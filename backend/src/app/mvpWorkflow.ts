import { AiProvider, analyzeCompany } from '../ai/provider';
import { BrowserSessionStore } from '../browser/session';
import { CompanyAnalysis, CompanyReview, SiteId } from '../domain/types';
import { ReviewRepository } from '../storage/repository';
import { JobReviewSitePlugin } from '../sites/sitePlugin';

// MVP 工作流请求来自 CLI 或未来的后端 API。
export interface MvpWorkflowRequest {
  companyQuery: string;
  selectedSiteIds: SiteId[];
  maxPages: number;
}

// 工作流返回抓取到的标准化评论和 AI 分析结果。
export interface MvpWorkflowResult {
  reviews: CompanyReview[];
  analysis: CompanyAnalysis;
}

// MvpWorkflow 是第一阶段的用例编排层，集中串起插件、会话、存储和 AI。
export class MvpWorkflow {
  constructor(
    private readonly plugins: JobReviewSitePlugin[],
    private readonly sessions: BrowserSessionStore,
    private readonly repository: ReviewRepository,
    private readonly aiProvider: AiProvider,
  ) {}

  // run 执行完整链路：记录搜索、登录/恢复、搜索公司、读取评论、AI 分析、保存结果。
  async run(request: MvpWorkflowRequest): Promise<MvpWorkflowResult> {
    await this.repository.saveSearch(request.companyQuery);

    // 只运行用户勾选的网站插件。
    const selectedPlugins = this.plugins.filter((plugin) => {
      return request.selectedSiteIds.includes(plugin.id);
    });
    const reviews: CompanyReview[] = [];

    // 每个站点独立恢复会话和读取数据，方便后续并行化或错误隔离。
    for (const plugin of selectedPlugins) {
      const restoredSession = await this.sessions.restore(plugin.id);
      const loggedInSession = await plugin.login({
        session: restoredSession,
        preferredAuthMethods: plugin.supportedAuthMethods.slice(),
      });

      await this.sessions.persist(loggedInSession);

      // 先取最高置信度候选；后续 UI 可以让用户手动选择公司。
      const companies = await plugin.searchCompany(loggedInSession, {
        query: request.companyQuery,
      });
      const bestCompany = companies[0];

      if (!bestCompany) {
        continue;
      }

      const siteReviews = await plugin.fetchCompanyReviews({
        session: loggedInSession,
        company: bestCompany,
        maxPages: request.maxPages,
      });

      reviews.push(...siteReviews);
    }

    // 评论先落库，再进行分析，便于失败重试和历史回看。
    await this.repository.saveReviews(reviews);

    // AI 分析只依赖标准化评论，不依赖任何站点私有结构。
    const analysis = await analyzeCompany({
      company: request.companyQuery,
      reviews,
      provider: this.aiProvider,
    });

    await this.repository.saveAnalysis(analysis);

    // 返回完整结果，供 CLI 输出或前端页面渲染。
    return {
      reviews,
      analysis,
    };
  }
}
