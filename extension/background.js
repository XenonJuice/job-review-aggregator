importScripts('parser.js');

const API_URL = 'http://127.0.0.1:3000/api/imports/tenshoku-kaigi';
const BASE_URL = 'https://jobtalk.jp';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'collect-tenshoku-kaigi') {
    return false;
  }

  collectAndImport(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  // 返回 true，允许异步任务结束后再回复 popup。
  return true;
});

async function collectAndImport(payload) {
  const companyQuery = String(payload?.companyQuery ?? '').trim();
  const maxPages = Number(payload?.maxPages ?? 1);

  if (!companyQuery) {
    throw new Error('请输入公司名。');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error('页数必须是 1 到 10。');
  }

  const searchUrl = `${BASE_URL}/companies/search?keyword=${encodeURIComponent(
    companyQuery,
  )}`;
  const searchData = await fetchNextData(searchUrl);
  const companies = JobTalkParser.extractCompanyCandidates(
    searchData,
    companyQuery,
  );
  const company = companies[0];

  if (!company) {
    throw new Error(`没有找到公司：${companyQuery}`);
  }

  const reviews = [];
  const seenIds = new Set();
  let loginConfirmed = JobTalkParser.isLoggedIn(searchData);

  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = `${BASE_URL}/companies/${company.id}/answers?page=${page}`;
    const nextData = await fetchNextData(pageUrl);
    loginConfirmed ||= JobTalkParser.isLoggedIn(nextData);
    const answers = JobTalkParser.extractAnswerNodes(nextData);

    if (answers.length === 0) {
      break;
    }

    for (const review of JobTalkParser.mapAnswersToReviews(
      answers,
      company.name,
      company.id,
    )) {
      if (!seenIds.has(review.externalId)) {
        seenIds.add(review.externalId);
        const { externalId, ...importedReview } = review;
        reviews.push(importedReview);
      }
    }

    if (page < maxPages) {
      await delay(600);
    }
  }

  if (!loginConfirmed) {
    throw new Error(
      '没有检测到転職会議登录状态。请先在这个 Chrome 中登录，再重新导入。',
    );
  }
  if (reviews.length === 0) {
    throw new Error('没有读取到可导入的评论。');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: company.name,
      reviews,
    }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? `本地后台导入失败：HTTP ${response.status}`);
  }

  return {
    company: company.name,
    reviewCount: body.reviews?.length ?? reviews.length,
    pagesRequested: maxPages,
  };
}

async function fetchNextData(url) {
  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`転職会議请求失败：HTTP ${response.status}`);
  }
  if (response.url.includes('sign_in')) {
    throw new Error('転職会議要求登录，请先在普通 Chrome 中完成登录。');
  }

  return JobTalkParser.parseNextData(await response.text());
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
