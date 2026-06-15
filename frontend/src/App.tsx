import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Clock3,
  Database,
  LoaderCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  AnalysisHistory,
  AnalysisResult,
  createAnalysis,
  getHistory,
  getSites,
  openSiteLogin,
  SearchHistory,
  Site,
  SiteId,
} from './api';
import tenshokuKaigiIcon from '../pic-resource/tensyokukaigi.png';

export default function App() {
  const [companyQuery, setCompanyQuery] = useState('富士ソフト');
  const [maxPages, setMaxPages] = useState(1);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<SiteId[]>([]);
  const [result, setResult] = useState<AnalysisResult>();
  const [searches, setSearches] = useState<SearchHistory[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingSiteId, setOpeningSiteId] = useState<SiteId>();
  const [siteMessage, setSiteMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void loadInitialData();
  }, []);

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

  // 网站选项同时承担选择与登录入口：确保站点选中后再请求后台打开浏览器。
  async function handleSiteClick(siteId: SiteId) {
    setSelectedSiteIds((current) =>
      current.includes(siteId) ? current : [...current, siteId],
    );
    setOpeningSiteId(siteId);
    setSiteMessage('');
    setError('');

    try {
      const result = await openSiteLogin(siteId);
      setSiteMessage(
        result.status === 'opened'
          ? 'Chromium 已打开，请在窗口中完成登录。'
          : '已切换到现有 Chromium 窗口。',
      );
    } catch (loginError) {
      setError(toErrorMessage(loginError));
    } finally {
      setOpeningSiteId(undefined);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Building2 size={20} />
          </span>
          <span>Japan Job Review AI</span>
        </div>
        <span className="status-pill">
          <span className="status-dot" />
          Local MVP
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
                    <button
                      className={
                        selectedSiteIds.includes(site.id)
                          ? 'site-option selected'
                          : 'site-option'
                      }
                      key={site.id}
                      disabled={openingSiteId === site.id}
                      onClick={() => void handleSiteClick(site.id)}
                      type="button"
                    >
                      {openingSiteId === site.id ? (
                        <LoaderCircle className="spin" size={24} />
                      ) : (
                        <img
                          alt=""
                          className="site-option-icon"
                          src={tenshokuKaigiIcon}
                        />
                      )}
                      <span>
                        {site.displayName}
                        <small>点击打开登录窗口</small>
                      </span>
                    </button>
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

                <div className="review-list">
                  {result.reviews.map((review, index) => (
                    <div className="review-item" key={`${review.title}-${index}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <h3>{review.title}</h3>
                        <p>{review.content}</p>
                      </div>
                    </div>
                  ))}
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
        数据保存在本机 SQLite 中。当前网站抓取与 AI 分析仍为 MVP
        占位实现。
      </footer>
    </div>
  );
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
