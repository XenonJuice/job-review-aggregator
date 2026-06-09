import { MockAiProvider } from './ai/providers/mockAiProvider';
import { MvpWorkflow } from './app/mvpWorkflow';
import { InMemoryBrowserSessionStore } from './browser/session';
import { TenshokuKaigiPlugin } from './sites/tenshokuKaigi';
import { InMemoryReviewRepository } from './storage/repository';

// CLI 入口用于在没有前端时验证 MVP 的端到端数据流。
async function main(): Promise<void> {
  // 组合依赖：一个站点插件、内存会话、内存仓库和 Mock AI。
  const workflow = new MvpWorkflow(
    [new TenshokuKaigiPlugin()],
    new InMemoryBrowserSessionStore(),
    new InMemoryReviewRepository(),
    new MockAiProvider(),
  );

  // 运行一个固定公司样例，后续会替换为前端输入或命令行参数。
  const result = await workflow.run({
    companyQuery: '富士ソフト',
    selectedSiteIds: ['tenshoku-kaigi'],
    maxPages: 1,
  });

  // 输出最小结果，方便确认构建产物可以正常执行。
  console.log('Japan Job Review AI Assistant MVP');
  console.log(`reviews: ${result.reviews.length}`);
  console.log(result.analysis.rawProviderOutput);
}

// 保持入口异步执行，同时不阻塞未来扩展为 HTTP server。
void main();
