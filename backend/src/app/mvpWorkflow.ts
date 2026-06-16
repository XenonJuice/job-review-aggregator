import { AiProvider, analyzeCompany } from '../ai/provider';
import { CompanyAnalysis, CompanyReview, SiteId } from '../domain/types';
import { ReviewRepository } from '../storage/repository';
import { JobReviewSitePlugin } from '../sites/sitePlugin';

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

export class MvpWorkflow {
  constructor(
    private readonly plugins: JobReviewSitePlugin[],
    private readonly repository: ReviewRepository,
    private readonly aiProvider: AiProvider,
  ) {}

  // run 执行公开页面分析链路：搜索公司、读取公开评论、AI 分析、保存结果。
  async run(request: MvpWorkflowRequest): Promise<MvpWorkflowResult> {
    await this.repository.saveSearch(request.companyQuery);

    // 只运行用户勾选的网站插件。
    const selectedPlugins = this.plugins.filter((plugin) => {
      return request.selectedSiteIds.includes(plugin.id);
    });
    const reviews: CompanyReview[] = [];

    for (const plugin of selectedPlugins) {
      const companies = await plugin.searchCompany({
        query: request.companyQuery,
      });
      const bestCompany = companies[0];

      if (!bestCompany) {
        continue;
      }

      const siteReviews = await plugin.fetchCompanyReviews({
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

    return {
      reviews,
      analysis,
    };
  }
}
