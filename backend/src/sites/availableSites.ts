import { SiteId } from '../domain/types';

export type AvailableSite = {
  id: SiteId;
  displayName: string;
};

// 前台站点选项从这里读取；以后新增网站时先在这里登记展示名称。
export const AVAILABLE_SITES: AvailableSite[] = [
  {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
  },
];
