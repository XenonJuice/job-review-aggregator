import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Clock3,
  Database,
  LoaderCircle,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  AnalysisHistory,
  AnalysisResult,
  AppSettings,
  clearDatabase,
  clearLoginCache,
  collectSiteReviews,
  createAnalysis,
  getAppSettings,
  getHistory,
  getSites,
  saveAppSettings,
  SearchHistory,
  Site,
  SiteId,
} from './api';
import tenshokuKaigiIcon from '../pic-resource/tensyokukaigi.png';

const REVIEWS_PER_PAGE = 15;
const SITE_ICONS: Record<string, string | undefined> = {
  'tenshoku-kaigi': tenshokuKaigiIcon,
};
const EMPTY_SETTINGS: AppSettings = {
  aiProvider: 'mock',
  apiKey: '',
  baseUrl: '',
  model: '',
};

export default function App() {
  const [companyQuery, setCompanyQuery] = useState('富士ソフト');
  const [maxPages, setMaxPages] = useState(1);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<SiteId[]>([]);
  const [result, setResult] = useState<AnalysisResult>();
  const [searches, setSearches] = useState<SearchHistory[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [collectingFullReviews, setCollectingFullReviews] = useState(false);
  const [activeSource, setActiveSource] = useState('all');
  const [activeReviewType, setActiveReviewType] = useState('all');
  const [reviewPage, setReviewPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [databaseConfirmText, setDatabaseConfirmText] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [siteMessage, setSiteMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void loadInitialData();
    void loadAppSettings();
  }, []);

  useEffect(() => {
    setActiveSource('all');
    setActiveReviewType('all');
    setReviewPage(1);
  }, [result]);

  const sourceOptions = useMemo(() => {
    return createCountOptions(result?.reviews ?? [], (review) => review.source);
  }, [result]);

  const sourceFilteredReviews = useMemo(() => {
    const reviews = result?.reviews ?? [];

    return activeSource === 'all'
      ? reviews
      : reviews.filter((review) => review.source === activeSource);
  }, [activeSource, result]);

  const reviewTypeOptions = useMemo(() => {
    return createCountOptions(
      sourceFilteredReviews,
      (review) => review.reviewType,
    );
  }, [sourceFilteredReviews]);

  const filteredReviews = useMemo(() => {
    return activeReviewType === 'all'
      ? sourceFilteredReviews
      : sourceFilteredReviews.filter(
          (review) => review.reviewType === activeReviewType,
        );
  }, [activeReviewType, sourceFilteredReviews]);

  const totalReviewPages = Math.max(
    1,
    Math.ceil(filteredReviews.length / REVIEWS_PER_PAGE),
  );
  const currentReviewPage = Math.min(reviewPage, totalReviewPages);
  const pagedReviews = filteredReviews.slice(
    (currentReviewPage - 1) * REVIEWS_PER_PAGE,
    currentReviewPage * REVIEWS_PER_PAGE,
  );

  async function loadInitialData() {
    try {
      const [availableSites, history] = await Promise.all([
        getSites(),
        getHistory(),
      ]);
      setSites(availableSites);
      setSelectedSiteIds(availableSites.map((site) => site.id));
      setSearches(history.searches);
      setAnalyses(history.analyses);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    }
  }

  async function loadAppSettings() {
    try {
      setSettings(await getAppSettings());
    } catch (settingsError) {
      setSettingsMessage(toErrorMessage(settingsError));
    }
  }

  function handleSourceChange(source: string) {
    setActiveSource(source);
    setActiveReviewType('all');
    setReviewPage(1);
  }

  function handleReviewTypeChange(reviewType: string) {
    setActiveReviewType(reviewType);
    setReviewPage(1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const nextResult = await createAnalysis({
        companyQuery,
        selectedSiteIds,
        maxPages,
      });
      setResult(nextResult);

      const history = await getHistory();
      setSearches(history.searches);
      setAnalyses(history.analyses);
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  function handleSiteClick(siteId: SiteId) {
    setSelectedSiteIds((current) =>
      current.includes(siteId) ? current : [...current, siteId],
    );
    setSiteMessage('读取登录后完整评论时，应用会自动打开登录窗口。');
  }

  async function handleCollectFullReviews() {
    setError('');
    setSiteMessage('');
    setCollectingFullReviews(true);

    try {
      const siteId = selectedSiteIds[0] ?? sites[0]?.id;

      if (!siteId) {
        throw new Error('请选择一个评价网站。');
      }

      const collectResult = await collectSiteReviews({
        siteId,
        companyQuery,
        maxPages,
      });
      setResult({
        reviews: collectResult.reviews,
        analysis: collectResult.analysis,
      });
      setSiteMessage(
        `已导入 ${collectResult.company} 的 ${collectResult.reviewCount} 条登录后评论。`,
      );

      const history = await getHistory();
      setSearches(history.searches);
      setAnalyses(history.analyses);
    } catch (collectError) {
      setError(toErrorMessage(collectError));
    } finally {
      setCollectingFullReviews(false);
    }
  }

  async function handleSaveSettings() {
    setSettingsBusy(true);
    setSettingsMessage('');

    try {
      setSettings(await saveAppSettings(settings));
      setSettingsMessage('AI 配置已保存。');
    } catch (settingsError) {
      setSettingsMessage(toErrorMessage(settingsError));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleClearLoginCache() {
    setSettingsBusy(true);
    setSettingsMessage('');

    try {
      await clearLoginCache();
      setSettingsMessage('登录缓存已清除，下次采集会重新登录。');
    } catch (settingsError) {
      setSettingsMessage(toErrorMessage(settingsError));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleClearDatabase() {
    setSettingsBusy(true);
    setSettingsMessage('');

    try {
      await clearDatabase(databaseConfirmText);
      setResult(undefined);
      setSearches([]);
      setAnalyses([]);
      setDatabaseConfirmText('');
      setSettingsMessage('数据库信息已清除。');
    } catch (settingsError) {
      setSettingsMessage(toErrorMessage(settingsError));
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="settings-wrapper">
            <button
              aria-expanded={settingsOpen}
              aria-label="打开设置"
              className="settings-trigger"
              onClick={() => setSettingsOpen((open) => !open)}
              type="button"
            >
              <Settings size={18} />
            </button>

            <div className={settingsOpen ? 'settings-menu open' : 'settings-menu'}>
              <div className="settings-section">
                <h2>设置</h2>
                <p>配置 AI Provider、清理登录状态或本地数据。</p>
              </div>

              <div className="settings-section">
                <label>
                  <span>AI Provider</span>
                  <select
                    value={settings.aiProvider}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        aiProvider: event.target.value,
                      }))
                    }
                  >
                    <option value="mock">Mock（当前默认）</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">自定义兼容接口</option>
                  </select>
                </label>
                <label>
                  <span>API Key</span>
                  <input
                    value={settings.apiKey}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder="sk-..."
                    type="password"
                  />
                </label>
                <label>
                  <span>Base URL</span>
                  <input
                    value={settings.baseUrl}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  <span>Model</span>
                  <input
                    value={settings.model}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                    placeholder="例如：gpt-4.1-mini"
                  />
                </label>
                <button
                  className="settings-primary"
                  disabled={settingsBusy}
                  onClick={() => void handleSaveSettings()}
                  type="button"
                >
                  保存 AI 配置
                </button>
              </div>

              <div className="settings-section danger-zone">
                <button
                  className="settings-secondary"
                  disabled={settingsBusy}
                  onClick={() => void handleClearLoginCache()}
                  type="button"
                >
                  清除登录缓存
                </button>

                <label>
                  <span>输入“清除数据库”确认</span>
                  <input
                    value={databaseConfirmText}
                    onChange={(event) => setDatabaseConfirmText(event.target.value)}
                    placeholder="清除数据库"
                  />
                </label>
                <button
                  className="settings-danger"
                  disabled={
                    settingsBusy ||
                    databaseConfirmText !== '清除数据库'
                  }
                  onClick={() => void handleClearDatabase()}
                  type="button"
                >
                  清除数据库信息
                </button>
              </div>

              {settingsMessage ? (
                <p className="settings-message">{settingsMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="brand">
            <span className="brand-mark">
              <Building2 size={20} />
            </span>
            <span>Japan Job Review AI</span>
          </div>
        </div>
        <span className="status-pill">
          <span className="status-dot" />
          本地应用
        </span>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">日本求职信息助手</p>
            <h1>
              搜索一家公司，
              <br />
              快速整理求职评价。
            </h1>
            <p className="hero-description">
              聚合已授权访问的评价内容，保存到本地数据库，并生成结构化 AI
              分析报告。
            </p>
          </div>

          <form className="search-card" onSubmit={handleSubmit}>
            <label htmlFor="company">公司名称</label>
            <div className="search-input">
              <Search size={20} />
              <input
                id="company"
                value={companyQuery}
                onChange={(event) => setCompanyQuery(event.target.value)}
                placeholder="例如：富士ソフト"
              />
            </div>

            <div className="form-row">
              <div>
                <span className="field-label">评价网站</span>
                <div className="site-options">
                  {sites.map((site) => (
                    <SiteOptionButton
                      key={site.id}
                      onClick={() => handleSiteClick(site.id)}
                      selected={selectedSiteIds.includes(site.id)}
                      site={site}
                    />
                  ))}
                </div>
                {siteMessage ? (
                  <p className="site-message">{siteMessage}</p>
                ) : null}
              </div>

              <label className="page-field">
                <span className="field-label">读取页数</span>
                <select
                  value={maxPages}
                  onChange={(event) => setMaxPages(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((page) => (
                    <option key={page} value={page}>
                      {page} 页
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              className="primary-button"
              disabled={
                loading ||
                companyQuery.trim().length === 0 ||
                selectedSiteIds.length === 0
              }
              type="submit"
            >
              {loading ? (
                <>
                  <LoaderCircle className="spin" size={19} />
                  正在分析
                </>
              ) : (
                <>
                  开始分析
                  <ArrowRight size={19} />
                </>
              )}
            </button>
            <button
              className="secondary-button"
              disabled={
                collectingFullReviews ||
                companyQuery.trim().length === 0 ||
                selectedSiteIds.length === 0
              }
              onClick={() => void handleCollectFullReviews()}
              type="button"
            >
              {collectingFullReviews ? (
                <>
                  <LoaderCircle className="spin" size={19} />
                  正在自动采集
                </>
              ) : (
                <>
                  读取登录后完整评论
                  <ArrowRight size={19} />
                </>
              )}
            </button>
            {error ? <p className="error-message">{error}</p> : null}
          </form>
        </section>

        <section className="content-grid">
          <article className="panel result-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Analysis</p>
                <h2>{result ? result.analysis.company : '最新分析'}</h2>
              </div>
              <span className="icon-badge">
                <Sparkles size={20} />
              </span>
            </div>

            {result ? (
              <div className="analysis-content">
                <div className="analysis-meta">
                  <span>{result.analysis.provider}</span>
                  <span>{result.reviews.length} 条评价</span>
                  <span>{result.analysis.sources.join('、')}</span>
                </div>
                <p>{result.analysis.rawProviderOutput}</p>

                <div className="review-controls">
                  <div>
                    <span className="review-control-label">网站</span>
                    <div className="tab-list">
                      {sourceOptions.map((option) => (
                        <button
                          className={
                            activeSource === option.value ? 'active' : ''
                          }
                          key={option.value}
                          onClick={() => handleSourceChange(option.value)}
                          type="button"
                        >
                          {formatSourceLabel(option.value)}
                          <small>{option.count}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="review-control-label">评价类型</span>
                    <div className="tab-list">
                      {reviewTypeOptions.map((option) => (
                        <button
                          className={
                            activeReviewType === option.value ? 'active' : ''
                          }
                          key={option.value}
                          onClick={() => handleReviewTypeChange(option.value)}
                          type="button"
                        >
                          {formatReviewTypeLabel(option.value)}
                          <small>{option.count}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="review-list">
                  {pagedReviews.length > 0 ? (
                    pagedReviews.map((review, index) => (
                      <div className="review-item" key={`${review.url ?? review.title}-${index}`}>
                        <span>
                          {String(
                            (currentReviewPage - 1) * REVIEWS_PER_PAGE +
                              index +
                              1,
                          ).padStart(2, '0')}
                        </span>
                        <div>
                          <div className="review-title-row">
                            <h3>{review.title}</h3>
                            <small>
                              {review.source} /{' '}
                              {formatReviewTypeLabel(review.reviewType)}
                            </small>
                          </div>
                          <p>{review.content}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">当前筛选条件下没有评论。</p>
                  )}
                </div>

                <div className="review-pagination">
                  <span>
                    第 {currentReviewPage} / {totalReviewPages} 页，
                    共 {filteredReviews.length} 条
                  </span>
                  <div>
                    <button
                      disabled={currentReviewPage <= 1}
                      onClick={() => setReviewPage((page) => page - 1)}
                      type="button"
                    >
                      上一页
                    </button>
                    <button
                      disabled={currentReviewPage >= totalReviewPages}
                      onClick={() => setReviewPage((page) => page + 1)}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Sparkles size={28} />
                <p>提交公司名称后，分析结果会显示在这里。</p>
              </div>
            )}
          </article>

          <aside className="history-column">
            <section className="panel compact-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Searches</p>
                  <h2>最近搜索</h2>
                </div>
                <Clock3 size={20} />
              </div>
              <div className="history-list">
                {searches.length > 0 ? (
                  searches.map((search) => (
                    <button
                      key={search.id}
                      onClick={() => setCompanyQuery(search.query)}
                      type="button"
                    >
                      <span>{search.query}</span>
                      <small>{formatDate(search.createdAt)}</small>
                    </button>
                  ))
                ) : (
                  <p className="muted">暂无搜索记录</p>
                )}
              </div>
            </section>

            <section className="panel compact-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Database</p>
                  <h2>分析历史</h2>
                </div>
                <Database size={20} />
              </div>
              <div className="history-list analysis-history">
                {analyses.length > 0 ? (
                  analyses.map((analysis) => (
                    <div key={analysis.id}>
                      <span>{analysis.company}</span>
                      <small>{analysis.provider}</small>
                    </div>
                  ))
                ) : (
                  <p className="muted">暂无分析记录</p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </main>

      <footer>
        数据保存在本机 SQLite 中。当前 AI 分析使用本地 Mock Provider。
      </footer>
    </div>
  );
}

function SiteOptionButton({
  onClick,
  selected,
  site,
}: {
  onClick: () => void;
  selected: boolean;
  site: Site;
}) {
  const icon = SITE_ICONS[site.id];

  return (
    <button
      className={selected ? 'site-option selected' : 'site-option'}
      disabled={false}
      onClick={onClick}
      type="button"
    >
      {icon ? (
        <img alt="" className="site-option-icon" src={icon} />
      ) : (
        <Building2 className="site-option-icon" size={24} />
      )}
      <span>
        {site.displayName}
        <small>支持登录后完整评论</small>
      </span>
    </button>
  );
}

function createCountOptions<T>(
  items: T[],
  getValue: (item: T) => string,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = getValue(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [
    { value: 'all', count: items.length },
    ...Array.from(counts.entries()).map(([value, count]) => ({
      value,
      count,
    })),
  ];
}

function formatSourceLabel(value: string): string {
  return value === 'all' ? '全部网站' : value;
}

function formatReviewTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    all: '全部类型',
    'company-review': '综合评价',
    interview: '面试',
    'work-environment': '工作环境',
    technology: '技术环境',
    foreigner: '外国人视角',
    salary: '年收/评价',
    'exit-reason': '离职理由',
  };

  return labels[value] ?? value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}

function formatDate(value: string): string {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
