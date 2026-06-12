-- 用户搜索历史：用于再次查看历史分析和快速重复搜索。
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 公司主数据：把不同站点的公司名归一到同一个内部公司记录。
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 标准化评论：保存企业评价、面试经验、年收入、离职原因等统一结构。
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  review_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  rating_json TEXT,
  posted_at TEXT,
  url TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- AI 分析结果：保存每次模型生成的结构化报告和原始输出。
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  overall_summary TEXT NOT NULL,
  interview_summary TEXT NOT NULL,
  technology_summary TEXT NOT NULL,
  risk_summary TEXT NOT NULL,
  foreigner_perspective TEXT NOT NULL,
  preparation_advice TEXT NOT NULL,
  raw_provider_output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
