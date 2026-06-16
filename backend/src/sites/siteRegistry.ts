import { SiteId } from '../domain/types';
import { JobReviewSitePlugin } from './sitePlugin';
import { TenshokuKaigiPlugin } from './tenshokuKaigi';

export interface SiteDesktopImportDefinition {
  source: string;
  allowedUrlHosts: readonly string[];
}

export interface SiteDefinition {
  id: SiteId;
  displayName: string;
  createPlugin: () => JobReviewSitePlugin;
  desktopImport?: SiteDesktopImportDefinition;
}

export interface ImportableSiteDefinition extends SiteDefinition {
  desktopImport: SiteDesktopImportDefinition;
}

// 新增网站时优先在这里登记插件、展示名称和桌面导入规则。
export const SITE_DEFINITIONS: readonly SiteDefinition[] = [
  {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    createPlugin: () => new TenshokuKaigiPlugin(),
    desktopImport: {
      source: '転職会議',
      allowedUrlHosts: ['jobtalk.jp'],
    },
  },
];

export function createSitePlugins(): JobReviewSitePlugin[] {
  return SITE_DEFINITIONS.map((site) => site.createPlugin());
}

export function getSiteDefinition(siteId: string): SiteDefinition | undefined {
  return SITE_DEFINITIONS.find((site) => site.id === siteId);
}

export function getImportableSiteDefinition(
  siteId: string,
): ImportableSiteDefinition | undefined {
  const site = getSiteDefinition(siteId);

  if (!site?.desktopImport) {
    return undefined;
  }

  return site as ImportableSiteDefinition;
}
