import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import {
  MvpWorkflowRequest,
  MvpWorkflowResult,
} from '../app/mvpWorkflow';
import { ImportedReviewWorkflowRequest } from '../app/importedReviewWorkflow';
import { CompanyReview, ReviewType, SiteId } from '../domain/types';
import { SiteLoginRequiredError } from '../sites/siteErrors';
import { ReviewRepository } from '../storage/repository';

interface WorkflowRunner {
  run(request: MvpWorkflowRequest): Promise<MvpWorkflowResult>;
}

interface ImportedReviewWorkflowRunner {
  run(request: ImportedReviewWorkflowRequest): Promise<MvpWorkflowResult>;
}

export interface ApiDependencies {
  workflow: WorkflowRunner;
  importedReviewWorkflow: ImportedReviewWorkflowRunner;
  repository: ReviewRepository;
}

const AVAILABLE_SITES = [
  {
    id: 'tenshoku-kaigi' as const,
    displayName: '転職会議',
  },
];

export function createApiApp(dependencies: ApiDependencies): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/sites', (_request, response) => {
    response.json({ sites: AVAILABLE_SITES });
  });

  app.post('/api/analyses', async (request, response) => {
    const validation = parseAnalysisRequest(request.body);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const result = await dependencies.workflow.run(validation.value);
    response.status(201).json(result);
  });

  // 普通 Chrome 扩展使用当前登录会话读取评论，再通过该接口导入本地数据库。
  app.post('/api/imports/tenshoku-kaigi', async (request, response) => {
    const validation = parseImportedReviewsRequest(request.body);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const result = await dependencies.importedReviewWorkflow.run(
      validation.value,
    );
    response.status(201).json(result);
  });

  app.get('/api/history/searches', async (request, response) => {
    const searches = await dependencies.repository.listSearches(
      parseHistoryLimit(request.query.limit),
    );

    response.json({ searches });
  });

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
      if (error instanceof SiteLoginRequiredError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

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

function parseImportedReviewsRequest(body: unknown): ImportedReviewsValidation {
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
    const review = parseImportedReview(value, company);

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
    source: '転職会議',
    reviewType: reviewType as ReviewType,
    title,
    content,
    rating,
    postedAt: parseOptionalString(value.postedAt),
    url: parseJobTalkUrl(value.url),
    metadata,
  };
}

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

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' && value.length <= 1_000
    ? value
    : undefined;
}

function parseJobTalkUrl(value: unknown): string | undefined {
  const rawUrl = parseOptionalString(value);

  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && url.hostname === 'jobtalk.jp'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

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

function parseHistoryLimit(value: unknown): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed =
    typeof rawValue === 'string' ? Number.parseInt(rawValue, 10) : 20;

  if (Number.isNaN(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
