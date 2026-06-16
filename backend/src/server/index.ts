import path from 'node:path';
import { MockAiProvider } from '../ai/providers/mockAiProvider';
import { ImportedReviewWorkflow } from '../app/importedReviewWorkflow';
import { MvpWorkflow } from '../app/mvpWorkflow';
import { TenshokuKaigiPlugin } from '../sites/tenshokuKaigi';
import { SQLiteReviewRepository } from '../storage/sqliteRepository';
import { createApiApp } from './app';

const port = parsePort(process.env.PORT);
const dbPath = path.resolve(process.env.DB_PATH ?? 'data/app.sqlite');

const repository = new SQLiteReviewRepository(dbPath);
const aiProvider = new MockAiProvider();
const workflow = new MvpWorkflow(
  [new TenshokuKaigiPlugin()],
  repository,
  aiProvider,
);
const importedReviewWorkflow = new ImportedReviewWorkflow(
  repository,
  aiProvider,
);
const app = createApiApp({
  workflow,
  importedReviewWorkflow,
  repository,
});

app.listen(port, () => {
  console.log(`API server: http://localhost:${port}`);
  console.log(`database: ${dbPath}`);
});

function parsePort(rawPort: string | undefined): number {
  const port = Number.parseInt(rawPort ?? '3000', 10);

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return 3000;
  }

  return port;
}
