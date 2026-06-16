const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const {
  MockAiProvider,
} = require('../dist/backend/ai/providers/mockAiProvider');
const { MvpWorkflow } = require('../dist/backend/app/mvpWorkflow');
const {
  ImportedReviewWorkflow,
} = require('../dist/backend/app/importedReviewWorkflow');
const { createApiApp } = require('../dist/backend/server/app');
const {
  SiteLoginRequiredError,
} = require('../dist/backend/sites/siteErrors');

class TestReviewRepository {
  searches = [];
  reviews = [];
  analyses = [];

  async saveSearch(query) {
    const record = {
      id: `${Date.now()}-${this.searches.length + 1}`,
      query,
      createdAt: new Date().toISOString(),
    };
    this.searches.push(record);
    return record;
  }

  async saveReviews(reviews) {
    this.reviews.push(...reviews);
  }

  async saveAnalysis(analysis) {
    this.analyses.push(analysis);
  }

  async listSearches(limit = 20) {
    return this.searches.slice(-limit).reverse();
  }

  async listAnalyses(limit = 20) {
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

  async clearAll() {
    this.searches.length = 0;
    this.reviews.length = 0;
    this.analyses.length = 0;
  }
}

test('API runs an analysis and exposes persisted history', async (context) => {
  const repository = new TestReviewRepository();
  // 集成测试使用确定性的假插件，不访问真实网站或用户浏览器 profile。
  const sitePlugin = {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    async searchCompany(input) {
      return [
        {
          siteId: 'tenshoku-kaigi',
          companyName: input.query,
          companyUrl: 'https://example.com/company',
          confidence: 1,
        },
      ];
    },
    async fetchCompanyReviews({ company }) {
      return [
        {
          company: company.companyName,
          source: '転職会議',
          reviewType: 'company-review',
          title: 'Test review',
          content: 'Test review content',
        },
      ];
    },
  };
  const workflow = new MvpWorkflow(
    [sitePlugin],
    repository,
    new MockAiProvider(),
  );
  const importedReviewWorkflow = new ImportedReviewWorkflow(
    repository,
    new MockAiProvider(),
  );
  const server = createApiApp({
    workflow,
    importedReviewWorkflow,
    repository,
  }).listen(0);

  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok' });

  const sitesResponse = await fetch(`${baseUrl}/api/sites`);
  assert.equal(sitesResponse.status, 200);
  assert.deepEqual(await sitesResponse.json(), {
    sites: [{ id: 'tenshoku-kaigi', displayName: '転職会議' }],
  });

  const invalidResponse = await fetch(`${baseUrl}/api/analyses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyQuery: '' }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    error: 'companyQuery is required',
  });

  const analysisResponse = await fetch(`${baseUrl}/api/analyses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyQuery: '富士ソフト',
      selectedSiteIds: ['tenshoku-kaigi'],
      maxPages: 1,
    }),
  });
  const analysisResult = await analysisResponse.json();

  assert.equal(analysisResponse.status, 201);
  assert.equal(analysisResult.reviews.length, 1);
  assert.equal(analysisResult.analysis.company, '富士ソフト');
  assert.equal(analysisResult.analysis.provider, 'mock');

  const importResponse = await fetch(`${baseUrl}/api/imports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: '富士ソフト',
      siteImports: [
        {
          siteId: 'tenshoku-kaigi',
          reviews: [
            {
              reviewType: 'company-review',
              title: '社風',
              content: '複数サイト導入用の评论',
              url: 'https://jobtalk.jp/companies/3894/answers/2',
            },
          ],
        },
      ],
    }),
  });
  const importResult = await importResponse.json();
  assert.equal(importResponse.status, 201);
  assert.equal(importResult.reviews.length, 1);
  assert.equal(importResult.reviews[0].source, '転職会議');

  const searchesResponse = await fetch(
    `${baseUrl}/api/history/searches?limit=1`,
  );
  const searchesResult = await searchesResponse.json();
  assert.equal(searchesResponse.status, 200);
  assert.equal(searchesResult.searches.length, 1);
  assert.equal(searchesResult.searches[0].query, '富士ソフト');

  const analysesResponse = await fetch(
    `${baseUrl}/api/history/analyses?limit=1`,
  );
  const analysesResult = await analysesResponse.json();
  assert.equal(analysesResponse.status, 200);
  assert.equal(analysesResult.analyses.length, 1);
  assert.equal(analysesResult.analyses[0].company, '富士ソフト');
});

test('API returns a readable conflict when site login is required', async (context) => {
  const repository = new TestReviewRepository();
  const workflow = {
    async run() {
      throw new SiteLoginRequiredError('Please sign in');
    },
  };
  const importedReviewWorkflow = new ImportedReviewWorkflow(
    repository,
    new MockAiProvider(),
  );
  const server = createApiApp({
    workflow,
    importedReviewWorkflow,
    repository,
  }).listen(0);

  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/analyses`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyQuery: '富士ソフト' }),
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'Please sign in' });
});
