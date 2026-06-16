import { AiProvider, analyzeCompany } from '../ai/provider';
import { CompanyReview } from '../domain/types';
import { ReviewRepository } from '../storage/repository';
import { MvpWorkflowResult } from './mvpWorkflow';

export interface ImportedReviewWorkflowRequest {
  company: string;
  reviews: CompanyReview[];
}

// 登录采集器只负责读取用户当前可见的评论，持久化和分析仍由后台统一处理。
export class ImportedReviewWorkflow {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly aiProvider: AiProvider,
  ) {}

  async run(
    request: ImportedReviewWorkflowRequest,
  ): Promise<MvpWorkflowResult> {
    await this.repository.saveSearch(request.company);
    await this.repository.saveReviews(request.reviews);

    const analysis = await analyzeCompany({
      company: request.company,
      reviews: request.reviews,
      provider: this.aiProvider,
    });

    await this.repository.saveAnalysis(analysis);

    return {
      reviews: request.reviews,
      analysis,
    };
  }
}
