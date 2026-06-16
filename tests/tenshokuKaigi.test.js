const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractAnswerNodes,
  extractCompanySearchResults,
} = require('../dist/backend/sites/tenshokuKaigi');

function createNextData(queryName, data) {
  return {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [
            {
              queryKey: [queryName],
              state: { data },
            },
          ],
        },
      },
    },
  };
}

test('extractCompanySearchResults prioritizes exact current or old names', () => {
  const nextData = createNextData('companies', {
    companies: {
      nodes: [
        {
          id: 7763,
          name: '富士ソフトサービスビューロ株式会社',
        },
        {
          id: 3894,
          name: 'Fマネジメント株式会社',
          oldCompanyName: '富士ソフト株式会社',
        },
      ],
    },
  });

  const results = extractCompanySearchResults(nextData, '富士ソフト');

  assert.equal(results.length, 2);
  assert.equal(results[0].companyUrl, 'https://jobtalk.jp/companies/3894');
  assert.equal(results[0].confidence, 1);
  assert.equal(results[1].confidence, 0.85);
});

test('extractAnswerNodes returns review records from companyAnswers pages', () => {
  const answers = [
    {
      id: 123,
      rating: 4,
      review: 'Review content',
      question: { code: 'worklife', name: 'ワークライフバランス' },
    },
  ];
  const nextData = createNextData('companyAnswers', {
    pages: [
      {
        company: {
          answers: { nodes: answers },
        },
      },
    ],
  });

  assert.deepEqual(extractAnswerNodes(nextData), answers);
});
