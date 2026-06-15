import path from 'node:path';
import { MockAiProvider } from '../ai/providers/mockAiProvider';
import { MvpWorkflow } from '../app/mvpWorkflow';
import { PlaywrightBrowserLoginService } from '../browser/playwrightLoginService';
import { FileSystemBrowserSessionStore } from '../browser/session';
import { TenshokuKaigiPlugin } from '../sites/tenshokuKaigi';
import { SQLiteReviewRepository } from '../storage/sqliteRepository';
import { createApiApp } from './app';

const port = parsePort(process.env.PORT);
const dbPath = path.resolve(process.env.DB_PATH ?? 'data/app.sqlite');
const browserProfileDir = path.resolve(
  process.env.BROWSER_PROFILE_DIR ?? 'browser-profiles',
);

const repository = new SQLiteReviewRepository(dbPath);
// 工作流和手动登录共用同一会话存储，确保后续抓取能读取用户登录后的 profile。
const sessions = new FileSystemBrowserSessionStore(browserProfileDir);
const workflow = new MvpWorkflow(
  [new TenshokuKaigiPlugin()],
  sessions,
  repository,
  new MockAiProvider(),
);
const browserLogin = new PlaywrightBrowserLoginService(sessions);
const app = createApiApp({ workflow, repository, browserLogin });

app.listen(port, () => {
  console.log(`API server: http://localhost:${port}`);
  console.log(`database: ${dbPath}`);
  console.log(`browser profile dir: ${browserProfileDir}`);
});

function parsePort(rawPort: string | undefined): number {
  const port = Number.parseInt(rawPort ?? '3000', 10);

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return 3000;
  }

  return port;
}
