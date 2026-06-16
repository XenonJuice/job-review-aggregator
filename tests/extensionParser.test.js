const assert = require('node:assert/strict');
const test = require('node:test');
const parser = require('../desktop/jobtalkParser');

function createHtml(queries, pageProps = {}) {
  const nextData = {
    props: {
      pageProps: {
        ...pageProps,
        dehydratedState: { queries },
      },
    },
  };

  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    nextData,
  )}</script>`;
}

test('desktop JobTalk parser selects the best company and normalizes reviews', () => {
  const searchData = parser.parseNextData(
    createHtml([
      {
        queryKey: ['companies'],
        state: {
          data: {
            companies: {
              nodes: [
                { id: 2, name: '富士ソフトサービス株式会社' },
                { id: 1, name: '富士ソフト株式会社' },
              ],
            },
          },
        },
      },
    ]),
  );
  const company = parser.extractCompanyCandidates(
    searchData,
    '富士ソフト',
  )[0];

  assert.equal(company.id, 1);
  assert.equal(company.confidence, 1);

  const answerData = parser.parseNextData(
    createHtml(
      [
        {
          queryKey: ['companyAnswers'],
          state: {
            data: {
              pages: [
                {
                  company: {
                    answers: {
                      nodes: [
                        {
                          id: 10,
                          review: ' 完整评论正文 ',
                          rating: 4,
                          question: { code: 'worklife', name: '働き方' },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
      {},
    ),
  );

  answerData.props.pageProps.dehydratedState.queries.push({
    queryKey: ['member'],
    state: { data: { id: 99 } },
  });
  assert.equal(parser.isLoggedIn(answerData), true);
  const answers = parser.extractAnswerNodes(answerData);
  const reviews = parser.mapAnswersToReviews(answers, company.name, company.id);
  assert.equal(reviews[0].content, '完整评论正文');
  assert.equal(reviews[0].reviewType, 'work-environment');
});
