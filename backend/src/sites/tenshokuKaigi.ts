import {
  CompanyReview,
  CompanySearchInput,
  CompanySearchResult,
  ReviewType,
} from '../domain/types';
import { FetchReviewsRequest, JobReviewSitePlugin } from './sitePlugin';
import { SiteLoginRequiredError } from './siteErrors';

const SITE_ID = 'tenshoku-kaigi';
const DISPLAY_NAME = '転職会議';
const BASE_URL = 'https://jobtalk.jp';

type NextData = {
  props?: {
    pageProps?: {
      dehydratedState?: {
        queries?: Array<{
          queryKey?: unknown[];
          state?: { data?: unknown };
        }>;
      };
    };
  };
};

type CompanyNode = {
  id: number;
  name: string;
  oldCompanyName?: string | null;
  commonlyKnownName?: string | null;
};

type AnswerNode = {
  id: number;
  rating?: number | null;
  review: string;
  postAt?: string | null;
  question?: {
    code?: string;
    name?: string;
  } | null;
  questionee?: {
    jobType?: string | null;
    position?: string | null;
    questioneeEmploymentType?: { name?: string } | null;
  } | null;
};

// 転職会議の Next.js ページに含まれる構造化データを、共通のサイト插件契約へ変換する。
export class TenshokuKaigiPlugin implements JobReviewSitePlugin {
  readonly id = SITE_ID;
  readonly displayName = DISPLAY_NAME;

  // 検索結果の構造化 JSON から会社候補を抽出し、入力名との一致度が高い順に返す。
  async searchCompany(input: CompanySearchInput): Promise<CompanySearchResult[]> {
    const query = input.query.trim();

    if (!query) {
      return [];
    }

    const nextData = await fetchNextData(
      `${BASE_URL}/companies/search?keyword=${encodeURIComponent(query)}`,
    );
    return extractCompanySearchResults(nextData, query);
  }

  // 公開ページで取得できる口コミを、指定ページ数の範囲で共通形式へ正規化する。
  async fetchCompanyReviews(request: FetchReviewsRequest): Promise<CompanyReview[]> {
    const companyId = parseCompanyId(request.company.companyUrl);

    if (!companyId || request.maxPages < 1) {
      return [];
    }

    const reviews: CompanyReview[] = [];
    const seenAnswerIds = new Set<number>();

    for (let pageNumber = 1; pageNumber <= request.maxPages; pageNumber += 1) {
      const pageUrl = `${BASE_URL}/companies/${companyId}/answers?page=${pageNumber}`;
      const nextData = await fetchNextData(pageUrl);
      const answers = extractAnswerNodes(nextData);

      if (answers.length === 0) {
        break;
      }

      for (const answer of answers) {
        if (!answer.review?.trim() || seenAnswerIds.has(answer.id)) {
          continue;
        }

        seenAnswerIds.add(answer.id);
        reviews.push(
          mapAnswerToReview(
            answer,
            request.company.companyName,
            `${BASE_URL}/companies/${companyId}/answers/${answer.id}`,
          ),
        );
      }
    }

    return reviews;
  }
}

async function fetchNextData(url: string): Promise<NextData> {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149 Safari/537.36',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`${DISPLAY_NAME}请求失败：HTTP ${response.status}`);
  }

  if (response.url.includes('sign_in')) {
    throw new SiteLoginRequiredError(
      `该页面需要${DISPLAY_NAME}会员权限，请使用桌面 App 的“读取登录后完整评论”。`,
    );
  }

  const html = await response.text();
  const markerIndex = html.indexOf('id="__NEXT_DATA__"');
  const contentStart = html.indexOf('>', markerIndex) + 1;
  const contentEnd = html.indexOf('</script>', contentStart);

  if (markerIndex < 0 || contentStart === 0 || contentEnd < 0) {
    throw new Error('転職会議页面结构已变化：找不到 __NEXT_DATA__。');
  }

  return JSON.parse(html.slice(contentStart, contentEnd)) as NextData;
}

function findQueryData(nextData: NextData, queryName: string): unknown {
  const queries =
    nextData.props?.pageProps?.dehydratedState?.queries ?? [];
  const query = queries.find((candidate) => candidate.queryKey?.[0] === queryName);
  return query?.state?.data;
}

export function extractCompanySearchResults(
  nextData: NextData,
  query: string,
): CompanySearchResult[] {
  const companies = findQueryData(nextData, 'companies') as
    | { companies?: { nodes?: CompanyNode[] } }
    | undefined;
  const nodes = companies?.companies?.nodes ?? [];

  return nodes
    .map((company) => {
      return {
        siteId: SITE_ID,
        companyName: company.name,
        companyUrl: `${BASE_URL}/companies/${company.id}`,
        confidence: calculateCompanyConfidence(query, company),
      } satisfies CompanySearchResult;
    })
    .sort((left, right) => right.confidence - left.confidence);
}

export function extractAnswerNodes(nextData: NextData): AnswerNode[] {
  const answerData = findQueryData(nextData, 'companyAnswers') as
    | {
        pages?: Array<{
          company?: {
            answers?: { nodes?: AnswerNode[] };
          };
        }>;
      }
    | undefined;

  return answerData?.pages?.[0]?.company?.answers?.nodes ?? [];
}

function calculateCompanyConfidence(query: string, company: CompanyNode): number {
  const normalizedQuery = normalizeCompanyName(query);
  const names = [
    company.name,
    company.oldCompanyName,
    company.commonlyKnownName,
  ]
    .filter((name): name is string => Boolean(name))
    .map(normalizeCompanyName);

  if (names.includes(normalizedQuery)) {
    return 1;
  }

  if (names.some((name) => name.includes(normalizedQuery))) {
    return 0.85;
  }

  if (names.some((name) => normalizedQuery.includes(name))) {
    return 0.75;
  }

  return 0.5;
}

function normalizeCompanyName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/株式会社|有限会社|合同会社|\s+/g, '')
    .toLocaleLowerCase('ja-JP');
}

function parseCompanyId(companyUrl: string): number | undefined {
  const match = new URL(companyUrl).pathname.match(/^\/companies\/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function mapAnswerToReview(
  answer: AnswerNode,
  companyName: string,
  url: string,
): CompanyReview {
  const metadata: Record<string, string> = {};

  if (answer.questionee?.jobType) {
    metadata.jobType = answer.questionee.jobType;
  }
  if (answer.questionee?.position) {
    metadata.position = answer.questionee.position;
  }
  if (answer.questionee?.questioneeEmploymentType?.name) {
    metadata.employmentType =
      answer.questionee.questioneeEmploymentType.name;
  }

  return {
    company: companyName,
    source: DISPLAY_NAME,
    reviewType: mapQuestionCode(answer.question?.code),
    title: answer.question?.name ?? '企業口コミ',
    content: answer.review.trim(),
    rating:
      typeof answer.rating === 'number'
        ? { overall: answer.rating }
        : undefined,
    postedAt: answer.postAt ?? undefined,
    url,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function mapQuestionCode(code: string | undefined): ReviewType {
  switch (code) {
    case 'examination':
      return 'interview';
    case 'worklife':
    case 'employee':
    case 'president':
    case 'woman':
    case 'welfare':
      return 'work-environment';
    case 'skill':
      return 'technology';
    case 'earns':
      return 'salary';
    case 'leave':
      return 'exit-reason';
    default:
      return 'company-review';
  }
}
