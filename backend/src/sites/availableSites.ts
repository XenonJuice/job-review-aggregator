import { SiteId } from '../domain/types';
import { SITE_DEFINITIONS } from './siteRegistry';

export type AvailableSite = {
  id: SiteId;
  displayName: string;
};

// 前台站点选项从统一站点注册表派生，避免展示列表和插件列表分叉。
export const AVAILABLE_SITES: AvailableSite[] = SITE_DEFINITIONS.map(
  ({ id, displayName }) => ({
    id,
    displayName,
  }),
);
