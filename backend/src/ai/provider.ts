import { CompanyAnalysis, CompanyReview } from '../domain/types';

// AI Provider 抽象统一所有模型供应商，业务层只依赖 analyze 方法。
export interface AiProvider {
  readonly name: string;
  analyze(prompt: string): Promise<string>;
}

// 分析请求把公司、评论和具体模型供应商组合起来。
export interface AnalysisRequest {
  company: string;
  reviews: CompanyReview[];
  provider: AiProvider;
}

// Prompt 构建函数负责把结构化评论转换成 LLM 可理解的分析任务。
export function buildCompanyAnalysisPrompt(company: string, reviews: CompanyReview[]): string {
  // 每条评论保留来源、类型、标题和正文，方便模型按证据汇总。
  const reviewBlocks = reviews.map((review, index) => {
    return [
      `#${index + 1}`,
      `source: ${review.source}`,
      `type: ${review.reviewType}`,
      `title: ${review.title}`,
      `content: ${review.content}`,
    ].join('\n');
  });

  // 固定输出维度，保证不同模型供应商返回的报告结构尽量一致。
  return [
    `あなたは日本で転職活動をするエンジニア向けの企業レビュー分析アシスタントです。`,
    `対象企業: ${company}`,
    '',
    '以下のレビューを根拠に、次の観点で日本語または中国語で簡潔に分析してください。',
    '- 会社总体评价',
    '- 面试分析',
    '- 技术环境分析',
    '- 风险提示',
    '- 外国人视角分析',
    '- 面试准备建议',
    '',
    'レビュー:',
    reviewBlocks.join('\n\n'),
  ].join('\n');
}

// 分析入口负责调用 Provider，并把模型输出包装成内部报告对象。
export async function analyzeCompany(request: AnalysisRequest): Promise<CompanyAnalysis> {
  const prompt = buildCompanyAnalysisPrompt(request.company, request.reviews);
  const rawProviderOutput = await request.provider.analyze(prompt);
  const sourceSet = new Set<string>();

  // 来源列表用于报告中展示多站点汇总覆盖范围。
  request.reviews.forEach((review) => sourceSet.add(review.source));

  // 当前先复用原始输出填充所有板块，后续真实解析器会拆成独立字段。
  return {
    company: request.company,
    provider: request.provider.name,
    sources: Array.from(sourceSet),
    overallSummary: rawProviderOutput,
    interviewSummary: rawProviderOutput,
    technologySummary: rawProviderOutput,
    riskSummary: rawProviderOutput,
    foreignerPerspective: rawProviderOutput,
    preparationAdvice: rawProviderOutput,
    rawProviderOutput,
  };
}
