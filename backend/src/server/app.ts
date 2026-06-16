import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import {
  MvpWorkflowRequest,
  MvpWorkflowResult,
} from '../app/mvpWorkflow';
import { ImportedReviewWorkflowRequest } from '../app/importedReviewWorkflow';
import { CompanyReview, ReviewType, SiteId } from '../domain/types';
import { AVAILABLE_SITES } from '../sites/availableSites';
import { SiteLoginRequiredError } from '../sites/siteErrors';
import {
  getImportableSiteDefinition,
  ImportableSiteDefinition,
} from '../sites/siteRegistry';
import { ReviewRepository } from '../storage/repository';

interface WorkflowRunner {
  run(request: MvpWorkflowRequest): Promise<MvpWorkflowResult>;
}

interface ImportedReviewWorkflowRunner {
  run(request: ImportedReviewWorkflowRequest): Promise<MvpWorkflowResult>;
}

// createApiApp 不自己创建数据库和业务流程，而是从外面接收依赖。
// 这样测试时可以传假的 workflow，桌面 App 运行时可以传真实 SQLite workflow。
export interface ApiDependencies {
  workflow: WorkflowRunner;
  importedReviewWorkflow: ImportedReviewWorkflowRunner;
  repository: ReviewRepository;
}

export function createApiApp(dependencies: ApiDependencies): express.Express {
  const app = express();

  // 允许前台页面访问这个 API，并把 JSON 请求体解析成 request.body。
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // 健康检查接口：只用来确认后台服务是否还活着。
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  // 前台的网站选项从这里拿，避免前台写死网站名称。
  app.get('/api/sites', (_request, response) => {
    response.json({ sites: AVAILABLE_SITES });
  });

  // 普通分析入口：前台提交公司名、网站、页数，后台负责抓取公开评论并分析。
  app.post('/api/analyses', async (request, response) => {
    const validation = parseAnalysisRequest(request.body);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const result = await dependencies.workflow.run(validation.value);
    response.status(201).json(result);
  });

  // 登录采集器读取完整评论，再按站点导入本地数据库并生成分析。
  app.post('/api/imports/:siteId', async (request, response) => {
    const site = getImportableSiteDefinition(request.params.siteId);

    if (!site) {
      response.status(404).json({ error: 'Unsupported import site' });
      return;
    }

    const validation = parseImportedReviewsRequest(request.body, site);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const result = await dependencies.importedReviewWorkflow.run(
      validation.value,
    );
    response.status(201).json(result);
  });

  // 最近搜索记录：用于右侧历史列表。
  app.get('/api/history/searches', async (request, response) => {
    const searches = await dependencies.repository.listSearches(
      parseHistoryLimit(request.query.limit),
    );

    response.json({ searches });
  });

  // 最近分析记录：也是从 SQLite 里读出来给前台展示。
  app.get('/api/history/analyses', async (request, response) => {
    const analyses = await dependencies.repository.listAnalyses(
      parseHistoryLimit(request.query.limit),
    );

    response.json({ analyses });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      // 登录权限不足是可预期错误，返回给前台让用户知道需要桌面登录采集。
      if (error instanceof SiteLoginRequiredError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

      // 其他错误先按 500 处理，同时在终端打印，方便开发时排查。
      console.error(error);
      response.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

type AnalysisRequestValidation =
  | { ok: true; value: MvpWorkflowRequest }
  | { ok: false; error: string };

type ImportedReviewsValidation =
  | { ok: true; value: ImportedReviewWorkflowRequest }
  | { ok: false; error: string };

const REVIEW_TYPES = new Set<ReviewType>([
  'company-review',
  'interview',
  'work-environment',
  'technology',
  'foreigner',
  'salary',
  'exit-reason',
]);

// 校验“开始分析”接口的请求体，把不可信的前台输入整理成业务层能用的数据。
function parseAnalysisRequest(body: unknown): AnalysisRequestValidation {
  if (!isRecord(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const companyQuery =
    typeof body.companyQuery === 'string' ? body.companyQuery.trim() : '';

  if (!companyQuery) {
    return { ok: false, error: 'companyQuery is required' };
  }

  const selectedSiteIds = parseSelectedSiteIds(body.selectedSiteIds);

  if (!selectedSiteIds) {
    return {
      ok: false,
      error: 'selectedSiteIds contains an unsupported site',
    };
  }

  const maxPages = body.maxPages ?? 1;

  if (
    typeof maxPages !== 'number' ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 10
  ) {
    return { ok: false, error: 'maxPages must be an integer from 1 to 10' };
  }

  return {
    ok: true,
    value: {
      companyQuery,
      selectedSiteIds,
      maxPages,
    },
  };
}

// 校验登录采集器导入的完整评论，防止无效数据直接写进数据库。
function parseImportedReviewsRequest(
  body: unknown,
  site: ImportableSiteDefinition,
): ImportedReviewsValidation {
  if (!isRecord(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const company = typeof body.company === 'string' ? body.company.trim() : '';

  if (!company) {
    return { ok: false, error: 'company is required' };
  }

  if (
    !Array.isArray(body.reviews) ||
    body.reviews.length < 1 ||
    body.reviews.length > 500
  ) {
    return { ok: false, error: 'reviews must contain 1 to 500 items' };
  }

  const reviews: CompanyReview[] = [];

  for (const value of body.reviews) {
    const review = parseImportedReview(value, company, site);

    if (!review) {
      return { ok: false, error: 'reviews contains an invalid item' };
    }

    reviews.push(review);
  }

  return { ok: true, value: { company, reviews } };
}

function parseImportedReview(
  value: unknown,
  company: string,
  site: ImportableSiteDefinition,
): CompanyReview | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const reviewType = value.reviewType;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const content = typeof value.content === 'string' ? value.content.trim() : '';

  if (
    typeof reviewType !== 'string' ||
    !REVIEW_TYPES.has(reviewType as ReviewType) ||
    !title ||
    !content
  ) {
    return undefined;
  }

  const rating = parseRating(value.rating);
  const metadata = parseMetadata(value.metadata);

  if (value.rating !== undefined && !rating) {
    return undefined;
  }

  if (value.metadata !== undefined && !metadata) {
    return undefined;
  }

  return {
    company,
    source: site.desktopImport.source,
    reviewType: reviewType as ReviewType,
    title,
    content,
    rating,
    postedAt: parseOptionalString(value.postedAt),
    url: parseSiteUrl(value.url, site.desktopImport.allowedUrlHosts),
    metadata,
  };
}

// 评分目前只接受 0 到 5 的 overall，其他结构先不入库。
function parseRating(value: unknown): CompanyReview['rating'] {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const overall = value.overall;

  if (
    typeof overall !== 'number' ||
    !Number.isFinite(overall) ||
    overall < 0 ||
    overall > 5
  ) {
    return undefined;
  }

  return { overall };
}

function parseMetadata(
  value: unknown,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value);

  // metadata 是补充字段，限制数量和长度，避免导入异常大对象。
  if (
    entries.length > 20 ||
    !entries.every(
      ([key, item]) =>
        key.length <= 100 &&
        typeof item === 'string' &&
        item.length <= 1_000,
    )
  ) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

// 可选字符串字段做长度限制，避免很长的异常内容进入数据库。
function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' && value.length <= 1_000
    ? value
    : undefined;
}

// URL 只接受当前站点配置里的 https 域名，避免保存奇怪的外部地址。
function parseSiteUrl(
  value: unknown,
  allowedUrlHosts: readonly string[],
): string | undefined {
  const rawUrl = parseOptionalString(value);

  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      isAllowedHostname(url.hostname, allowedUrlHosts)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedHostname(
  hostname: string,
  allowedUrlHosts: readonly string[],
): boolean {
  return allowedUrlHosts.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
  );
}

// 如果前台没有传网站，默认使用当前登记的全部网站；传了就必须是支持的网站。
function parseSelectedSiteIds(value: unknown): SiteId[] | undefined {
  if (value === undefined) {
    return AVAILABLE_SITES.map((site) => site.id);
  }

  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const availableSiteIds = new Set<string>(
    AVAILABLE_SITES.map((site) => site.id),
  );

  if (
    !value.every(
      (siteId): siteId is SiteId =>
        typeof siteId === 'string' && availableSiteIds.has(siteId),
    )
  ) {
    return undefined;
  }

  return value;
}

// 历史记录 limit 做上下限保护，避免一次读太多。
function parseHistoryLimit(value: unknown): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed =
    typeof rawValue === 'string' ? Number.parseInt(rawValue, 10) : 20;

  if (Number.isNaN(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

// TypeScript 里 unknown 不能直接取字段，先确认它是普通对象。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
