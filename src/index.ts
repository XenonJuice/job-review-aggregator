import { MockAiProvider } from './ai/providers/mockAiProvider';
import { MvpWorkflow } from './app/mvpWorkflow';
import { FileSystemBrowserSessionStore } from './browser/session';
import { loadAppConfig } from './config/appConfig';
import { exportMarkdownReport } from './export/markdownExporter';
import { TenshokuKaigiPlugin } from './sites/tenshokuKaigi';
import { InMemoryReviewRepository } from './storage/repository';

// CLI 入口用于在没有前端时验证 MVP 的端到端数据流。
async function main(): Promise<void> {
  const config = loadAppConfig(process.argv.slice(2));

  // 组合依赖：一个站点插件、文件系统会话、内存仓库和 Mock AI。
  const workflow = new MvpWorkflow(
    [new TenshokuKaigiPlugin()],
    new FileSystemBrowserSessionStore(config.browserProfileDir),
    new InMemoryReviewRepository(),
    new MockAiProvider(),
  );

  // 使用 CLI 配置运行公司搜索和分析流程。
  const result = await workflow.run({
    companyQuery: config.companyQuery,
    selectedSiteIds: config.selectedSiteIds,
    maxPages: config.maxPages,
  });

  if (config.exportMarkdownPath) {
    await exportMarkdownReport(config.exportMarkdownPath, {
      analysis: result.analysis,
      reviews: result.reviews,
      generatedAt: new Date().toISOString(),
    });
  }

  // 输出最小结果，方便确认构建产物可以正常执行。
  console.log('Japan Job Review AI Assistant MVP');
  console.log(`company: ${config.companyQuery}`);
  console.log(`sites: ${config.selectedSiteIds.join(', ')}`);
  console.log(`reviews: ${result.reviews.length}`);
  console.log(`browser profile dir: ${config.browserProfileDir}`);
  if (config.exportMarkdownPath) {
    console.log(`markdown report: ${config.exportMarkdownPath}`);
  }
  console.log(result.analysis.rawProviderOutput);
}

// 保持入口异步执行，同时不阻塞未来扩展为 HTTP server。
void main();
