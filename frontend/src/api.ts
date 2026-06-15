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
  const body = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    const message =
      'error' in body && body.error ? body.error : '请求失败，请稍后重试';
    throw new Error(message);
  }

  return body as T;
}
