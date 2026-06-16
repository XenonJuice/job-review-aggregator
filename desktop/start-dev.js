const { spawn } = require('node:child_process');

const FRONTEND_URL = 'http://localhost:5173';
const API_URL = 'http://127.0.0.1:3000/api/health';

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await Promise.all([
    waitForUrl(FRONTEND_URL),
    waitForUrl(API_URL),
  ]);

  const electron = spawn(
    process.platform === 'win32'
      ? 'node_modules/.bin/electron.cmd'
      : 'node_modules/.bin/electron',
    ['desktop/app.js'],
    {
      env: {
        ...process.env,
        FRONTEND_URL,
      },
      stdio: 'inherit',
    },
  );

  electron.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

async function waitForUrl(url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 服务仍在启动，短暂等待后重试。
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}
