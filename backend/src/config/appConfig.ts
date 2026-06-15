import path from 'node:path';
import { SiteId } from '../domain/types';

export interface AppConfig {
  // 要搜索的公司
  companyQuery: string;
  // 启用的招聘评价网站
  selectedSiteIds: SiteId[];
  // 最多抓取页数
  maxPages: number;
  // 浏览器登录信息保存目录
  browserProfileDir: string;
  // Markdown 报告导出路径，可选
  exportMarkdownPath?: string;
  // db路径
  dbPath: string;
}

interface CliOptions {
  company?: string;
  sites?: string;
  maxPages?: string;
  profileDir?: string;
  exportMarkdown?: string;
  db?: string;
}

const DEFAULT_COMPANY = '富士ソフト';
const DEFAULT_SITE_IDS: SiteId[] = ['tenshoku-kaigi'];
const KNOWN_SITE_IDS: SiteId[] = [
  'tenshoku-kaigi',
  'openwork',
  'lighthouse',
  'careerconnection',
  'green',
  'wantedly',
  'findy',
];

// 从命令行参数构建运行配置，保持 CLI 简单且不依赖第三方解析库。
export function loadAppConfig(argv: string[]): AppConfig {
  const options = parseCliOptions(argv);
  const selectedSiteIds = parseSiteIds(options.sites);
  const maxPages = parseMaxPages(options.maxPages);

  return {
    companyQuery: options.company?.trim() || DEFAULT_COMPANY,
    selectedSiteIds,
    maxPages,
    browserProfileDir: path.resolve(options.profileDir ?? 'browser-profiles'),
    exportMarkdownPath: options.exportMarkdown
      ? path.resolve(options.exportMarkdown)
      : undefined,
    dbPath: path.resolve(options.db ?? 'data/app.sqlite'),
  };
}

// 支持 --key=value 和 --key value 两种写法。
function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = current.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    assignCliOption(options, rawKey, value);
  }

  return options;
}

// 把命令行 key 映射到内部配置字段。
function assignCliOption(options: CliOptions, key: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  switch (key) {
    case 'company':
      options.company = value;
      break;
    case 'sites':
      options.sites = value;
      break;
    case 'max-pages':
      options.maxPages = value;
      break;
    case 'profile-dir':
      options.profileDir = value;
      break;
    case 'export-md':
      options.exportMarkdown = value;
      break;
    case 'db':
      options.db = value;
      break;
    default:
      break;
  }
}

// 站点列表只接受已知插件 ID，避免拼写错误悄悄进入工作流。
function parseSiteIds(rawSites: string | undefined): SiteId[] {
  if (!rawSites) {
    return DEFAULT_SITE_IDS;
  }

  const siteIds = rawSites
    .split(',')
    .map((siteId) => siteId.trim())
    .filter((siteId): siteId is SiteId => {
      return KNOWN_SITE_IDS.includes(siteId as SiteId);
    });

  return siteIds.length > 0 ? siteIds : DEFAULT_SITE_IDS;
}

// 分页数限制在合理范围内，避免误操作造成过多页面读取。
function parseMaxPages(rawMaxPages: string | undefined): number {
  const parsed = Number.parseInt(rawMaxPages ?? '1', 10);

  if (Number.isNaN(parsed)) {
    return 1;
  }

  return Math.min(Math.max(parsed, 1), 10);
}
