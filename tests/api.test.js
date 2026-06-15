const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const {
  MockAiProvider,
} = require('../dist/backend/ai/providers/mockAiProvider');
const { MvpWorkflow } = require('../dist/backend/app/mvpWorkflow');
const {
  InMemoryBrowserSessionStore,
} = require('../dist/backend/browser/session');
const { createApiApp } = require('../dist/backend/server/app');
const {
  SiteLoginRequiredError,
} = require('../dist/backend/sites/siteErrors');
const {
  InMemoryReviewRepository,
} = require('../dist/backend/storage/repository');

test('API runs an analysis and exposes persisted history', async (context) => {
  const repository = new InMemoryReviewRepository();
  // 集成测试使用确定性的假插件，不访问真实网站或用户浏览器 profile。
  const sitePlugin = {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    supportedAuthMethods: ['password'],
    async login({ session }) {
      return { ...session, restored: true };
    },
    async searchCompany(_session, input) {
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
    new InMemoryBrowserSessionStore(),
    repository,
    new MockAiProvider(),
  );
  // API 测试用轻量替身记录调用，避免自动化测试真的打开 Chromium。
  const browserLoginCalls = [];
  const browserLogin = {
    async open(siteId) {
      browserLoginCalls.push(siteId);
      return { siteId, status: 'opened' };
    },
  };
  const server = createApiApp({
    workflow,
    repository,
    browserLogin,
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

  const loginResponse = await fetch(
    `${baseUrl}/api/sites/tenshoku-kaigi/login`,
    { method: 'POST' },
  );
  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    siteId: 'tenshoku-kaigi',
    status: 'opened',
  });
  assert.deepEqual(browserLoginCalls, ['tenshoku-kaigi']);

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
  const repository = new InMemoryReviewRepository();
  const workflow = {
    async run() {
      throw new SiteLoginRequiredError('Please sign in');
    },
  };
  const browserLogin = {
    async open(siteId) {
      return { siteId, status: 'opened' };
    },
  };
  const server = createApiApp({
    workflow,
    repository,
    browserLogin,
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
