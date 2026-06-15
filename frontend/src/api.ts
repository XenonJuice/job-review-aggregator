export type SiteId = 'tenshoku-kaigi';

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

export async function getSites(): Promise<Site[]> {
  const result = await request<{ sites: Site[] }>('/api/sites');
  return result.sites;
}

// 请求本机后台打开站点登录窗口；浏览器本身不在前端页面进程中启动。
export async function openSiteLogin(
  siteId: SiteId,
): Promise<{ siteId: SiteId; status: 'opened' | 'focused' }> {
  return request(`/api/sites/${siteId}/login`, {
    method: 'POST',
  });
}

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
