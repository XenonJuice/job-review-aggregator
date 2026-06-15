import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import {
  MvpWorkflowRequest,
  MvpWorkflowResult,
} from '../app/mvpWorkflow';
import { BrowserLoginService } from '../browser/playwrightLoginService';
import { SiteId } from '../domain/types';
import { ReviewRepository } from '../storage/repository';

interface WorkflowRunner {
  run(request: MvpWorkflowRequest): Promise<MvpWorkflowResult>;
}

export interface ApiDependencies {
  workflow: WorkflowRunner;
  repository: ReviewRepository;
  browserLogin: BrowserLoginService;
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
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/sites', (_request, response) => {
    response.json({ sites: AVAILABLE_SITES });
  });

  // 前端点击站点选项时调用，由本机后台启动或聚焦持久化 Chromium。
  app.post('/api/sites/:siteId/login', async (request, response) => {
    const siteId = parseAvailableSiteId(request.params.siteId);

    if (!siteId) {
      response.status(404).json({ error: 'Unsupported site' });
      return;
    }

    const result = await dependencies.browserLogin.open(siteId);
    response.json(result);
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
      console.error(error);
      response.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

type AnalysisRequestValidation =
  | { ok: true; value: MvpWorkflowRequest }
  | { ok: false; error: string };

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

function parseAvailableSiteId(value: string): SiteId | undefined {
  return AVAILABLE_SITES.find((site) => site.id === value)?.id;
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
