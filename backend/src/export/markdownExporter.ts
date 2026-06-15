import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CompanyAnalysis, CompanyReview } from '../domain/types';

export interface MarkdownReportInput {
  analysis: CompanyAnalysis;
  reviews: CompanyReview[];
  generatedAt: string;
}

// 将分析结果导出为 Markdown，后续 PDF/HTML 可以基于同一份报告模型扩展。
export async function exportMarkdownReport(
  outputPath: string,
  input: MarkdownReportInput,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderMarkdownReport(input), 'utf8');
}

// 渲染报告正文，保持格式稳定，方便用户复制或后续转换为 PDF。
export function renderMarkdownReport(input: MarkdownReportInput): string {
  const { analysis, reviews, generatedAt } = input;
  const reviewSections = reviews.map((review, index) => {
    return [
      `### ${index + 1}. ${escapeMarkdown(review.title)}`,
      '',
      `- Source: ${review.source}`,
      `- Type: ${review.reviewType}`,
      review.url ? `- URL: ${review.url}` : undefined,
      '',
      review.content,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  });

  return [
    `# ${escapeMarkdown(analysis.company)} 分析报告`,
    '',
    `Generated at: ${generatedAt}`,
    `Sources: ${analysis.sources.join(', ') || 'none'}`,
    '',
    '## AI 分析',
    '',
    analysis.rawProviderOutput,
    '',
    '## 原始评论',
    '',
    reviewSections.join('\n\n') || 'No reviews collected.',
    '',
  ].join('\n');
}

// Markdown 标题里只转义会破坏结构的少数字符。
function escapeMarkdown(value: string): string {
  return value.replace(/([#\\])/g, '\\$1');
}
