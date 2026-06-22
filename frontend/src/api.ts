export type SiteId = string;

export interface Site {
  id: SiteId;
  displayName: string;
}

export interface Review {
  company: string;
  source: string;
  reviewType: string;
  title: string;
  content: string;
  url?: string;
}

export interface Analysis {
  company: string;
  provider: string;
  sources: string[];
  overallSummary: string;
  rawProviderOutput: string;
}

export interface AnalysisResult {
  reviews: Review[];
  analysis: Analysis;
}

export interface SearchHistory {
  id: string;
  query: string;
  createdAt: string;
}

export interface AnalysisHistory {
  id: string;
  company: string;
  provider: string;
  createdAt: string;
  summary: string;
}

export interface SiteImportResult extends AnalysisResult {
  company: string;
  reviewCount: number;
  siteResults: Array<{
    siteId: SiteId;
    displayName: string;
    company: string;
    reviewCount: number;
  }>;
}

export interface AppSettings {
  aiProvider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppBridge {
  collectAndImportSiteReviews(input: {
    companyQuery: string;
    siteIds: SiteId[];
    maxPages: number;
  }): Promise<SiteImportResult>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  clearLoginCache(): Promise<{ ok: true }>;
  clearDatabase(confirmText: string): Promise<{ ok: true }>;
}

// 类型增强，运行时会擦除
declare global {
  interface Window {
    jobReviewAggregator?: AppBridge;
  }
}

export async function collectAndImportSiteReviews(input: {
  companyQuery: string;
  siteIds: SiteId[];
  maxPages: number;
}): Promise<SiteImportResult> {
  if (!window.jobReviewAggregator) {
    throw new Error('应用桥接未初始化，请重新打开应用。');
  }

  return window.jobReviewAggregator.collectAndImportSiteReviews(input);
}

export async function getAppSettings(): Promise<AppSettings> {
  if (!window.jobReviewAggregator) {
    throw new Error('应用桥接未初始化，请重新打开应用。');
  }

  return window.jobReviewAggregator.getSettings();
}

export async function saveAppSettings(
  settings: AppSettings,
): Promise<AppSettings> {
  if (!window.jobReviewAggregator) {
    throw new Error('应用桥接未初始化，请重新打开应用。');
  }

  return window.jobReviewAggregator.saveSettings(settings);
}

export async function clearLoginCache(): Promise<void> {
  if (!window.jobReviewAggregator) {
    throw new Error('应用桥接未初始化，请重新打开应用。');
  }

  await window.jobReviewAggregator.clearLoginCache();
}

export async function clearDatabase(confirmText: string): Promise<void> {
  if (!window.jobReviewAggregator) {
    throw new Error('应用桥接未初始化，请重新打开应用。');
  }

  await window.jobReviewAggregator.clearDatabase(confirmText);
}

export async function getSites(): Promise<Site[]> {
  const result = await request<{ sites: Site[] }>('/api/sites');
  return result.sites;
}

export async function getHistory(): Promise<{
  searches: SearchHistory[];
  analyses: AnalysisHistory[];
}> {
  const [searchResult, analysisResult] = await Promise.all([
    request<{ searches: SearchHistory[] }>('/api/history/searches?limit=8'),
    request<{ analyses: AnalysisHistory[] }>('/api/history/analyses?limit=8'),
  ]);

  return {
    searches: searchResult.searches,
    analyses: analysisResult.analyses,
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(getErrorMessage(body));
  }

  return body as T;
}

function getErrorMessage(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }

  return '请求失败，请稍后重试';
}
