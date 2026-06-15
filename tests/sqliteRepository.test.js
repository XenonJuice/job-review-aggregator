const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SQLiteReviewRepository } = require('../dist/storage/sqliteRepository');

test('SQLiteReviewRepository persists search and analysis history', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'job-review-'));
  const repository = new SQLiteReviewRepository(path.join(tempDir, 'app.sqlite'));

  await repository.saveSearch('富士ソフト');
  await repository.saveReviews([
    {
      company: '富士ソフト',
      source: '転職会議',
      reviewType: 'company-review',
      title: 'Review title',
      content: 'Review content',
    },
  ]);
  await repository.saveAnalysis({
    company: '富士ソフト',
    provider: 'mock',
    sources: ['転職会議'],
    overallSummary: 'Overall summary',
    interviewSummary: 'Interview summary',
    technologySummary: 'Technology summary',
    riskSummary: 'Risk summary',
    foreignerPerspective: 'Foreigner perspective',
    preparationAdvice: 'Preparation advice',
    rawProviderOutput: 'Raw output',
  });

  const searches = await repository.listSearches();
  const analyses = await repository.listAnalyses();

  assert.equal(searches.length, 1);
  assert.equal(searches[0].query, '富士ソフト');
  assert.equal(analyses.length, 1);
  assert.equal(analyses[0].company, '富士ソフト');
  assert.equal(analyses[0].provider, 'mock');
  assert.equal(analyses[0].summary, 'Overall summary');
});
