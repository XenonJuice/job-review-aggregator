const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadAppConfig } = require('../dist/config/appConfig');

test('loadAppConfig returns local defaults', () => {
  const config = loadAppConfig([]);

  assert.equal(config.companyQuery, '富士ソフト');
  assert.deepEqual(config.selectedSiteIds, ['tenshoku-kaigi']);
  assert.equal(config.maxPages, 1);
  assert.equal(config.dbPath, path.resolve('data/app.sqlite'));
  assert.equal(config.browserProfileDir, path.resolve('browser-profiles'));
  assert.equal(config.exportMarkdownPath, undefined);
});

test('loadAppConfig parses supported CLI options', () => {
  const config = loadAppConfig([
    '--company',
    '楽天グループ',
    '--sites=tenshoku-kaigi,openwork',
    '--max-pages',
    '4',
    '--profile-dir',
    'tmp/profiles',
    '--db=tmp/app.sqlite',
    '--export-md',
    'tmp/report.md',
  ]);

  assert.equal(config.companyQuery, '楽天グループ');
  assert.deepEqual(config.selectedSiteIds, ['tenshoku-kaigi', 'openwork']);
  assert.equal(config.maxPages, 4);
  assert.equal(config.browserProfileDir, path.resolve('tmp/profiles'));
  assert.equal(config.dbPath, path.resolve('tmp/app.sqlite'));
  assert.equal(config.exportMarkdownPath, path.resolve('tmp/report.md'));
});

test('loadAppConfig constrains pages and ignores unknown sites', () => {
  const config = loadAppConfig([
    '--sites',
    'unknown-site',
    '--max-pages',
    '100',
  ]);

  assert.deepEqual(config.selectedSiteIds, ['tenshoku-kaigi']);
  assert.equal(config.maxPages, 10);
});
