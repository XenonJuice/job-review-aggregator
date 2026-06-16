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

export interface DesktopCollectResult extends AnalysisResult {
  company: string;
  reviewCount: number;
}

export interface DesktopSettings {
  aiProvider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DesktopBridge {
  isDesktop: true;
  collectSiteReviews(input: {
    siteId: SiteId;
    companyQuery: string;
    maxPages: number;
  }): Promise<DesktopCollectResult>;
  collectTenshokuKaigi(input: {
    companyQuery: string;
    maxPages: number;
  }): Promise<DesktopCollectResult>;
  getSettings(): Promise<DesktopSettings>;
  saveSettings(settings: DesktopSettings): Promise<DesktopSettings>;
  clearLoginCache(): Promise<{ ok: true }>;
  clearDatabase(confirmText: string): Promise<{ ok: true }>;
}

declare global {
  interface Window {
    jobReviewAggregator?: DesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return window.jobReviewAggregator?.isDesktop === true;
}

export async function collectSiteReviewsInDesktop(input: {
  siteId: SiteId;
  companyQuery: string;
  maxPages: number;
}): Promise<DesktopCollectResult> {
  if (!window.jobReviewAggregator) {
    throw new Error('当前不是桌面 App 环境。');
  }

  return window.jobReviewAggregator.collectSiteReviews(input);
}

export async function getDesktopSettings(): Promise<DesktopSettings> {
  if (!window.jobReviewAggregator) {
    throw new Error('当前不是桌面 App 环境。');
  }

  return window.jobReviewAggregator.getSettings();
}

export async function saveDesktopSettings(
  settings: DesktopSettings,
): Promise<DesktopSettings> {
  if (!window.jobReviewAggregator) {
    throw new Error('当前不是桌面 App 环境。');
  }

  return window.jobReviewAggregator.saveSettings(settings);
}

export async function clearDesktopLoginCache(): Promise<void> {
  if (!window.jobReviewAggregator) {
    throw new Error('当前不是桌面 App 环境。');
  }

  await window.jobReviewAggregator.clearLoginCache();
}

export async function clearDesktopDatabase(confirmText: string): Promise<void> {
  if (!window.jobReviewAggregator) {
    throw new Error('当前不是桌面 App 环境。');
  }

  await window.jobReviewAggregator.clearDatabase(confirmText);
}

export async function getSites(): Promise<Site[]> {
  const result = await request<{ sites: Site[] }>('/api/sites');
  return result.sites;
}

// 请求本机后台打开站点登录窗口；浏览器本身不在前端页面进程中启动。
export async function createAnalysis(input: {
  companyQuery: string;
  selectedSiteIds: SiteId[];
  maxPages: number;
}): Promise<AnalysisResult> {
  return request<AnalysisResult>('/api/analyses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
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
