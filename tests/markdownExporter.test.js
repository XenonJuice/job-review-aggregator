const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdownReport } = require('../dist/export/markdownExporter');

test('renderMarkdownReport includes analysis and review details', () => {
  const markdown = renderMarkdownReport({
    generatedAt: '2026-06-16T00:00:00.000Z',
    analysis: {
      company: '#Example Company',
      provider: 'mock',
      sources: ['転職会議'],
      overallSummary: 'Overall',
      interviewSummary: 'Interview',
      technologySummary: 'Technology',
      riskSummary: 'Risk',
      foreignerPerspective: 'Foreigner',
      preparationAdvice: 'Advice',
      rawProviderOutput: 'Generated analysis',
    },
    reviews: [
      {
        company: '#Example Company',
        source: '転職会議',
        reviewType: 'company-review',
        title: '#Review title',
        content: 'Review content',
        url: 'https://example.com/review',
      },
    ],
  });

  assert.match(markdown, /^# \\#Example Company 分析报告/);
  assert.match(markdown, /Generated analysis/);
  assert.match(markdown, /### 1\. \\#Review title/);
  assert.match(markdown, /https:\/\/example\.com\/review/);
  assert.match(markdown, /Review content/);
});
