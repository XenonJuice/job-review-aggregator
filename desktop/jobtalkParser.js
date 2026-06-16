(function exposeParser(root, factory) {
  const parser = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = parser;
    return;
  }

  root.JobTalkParser = parser;
})(globalThis, function createParser() {
  const BASE_URL = 'https://jobtalk.jp';

  function parseNextData(html) {
    const markerIndex = html.indexOf('id="__NEXT_DATA__"');
    const contentStart = html.indexOf('>', markerIndex) + 1;
    const contentEnd = html.indexOf('</script>', contentStart);

    if (markerIndex < 0 || contentStart === 0 || contentEnd < 0) {
      throw new Error('転職会議页面结构已变化：找不到 __NEXT_DATA__。');
    }

    return JSON.parse(html.slice(contentStart, contentEnd));
  }

  function findQueryData(nextData, queryName) {
    const queries =
      nextData?.props?.pageProps?.dehydratedState?.queries ?? [];
    return queries.find((query) => query.queryKey?.[0] === queryName)?.state
      ?.data;
  }

  function isLoggedIn(nextData) {
    const pageProps = nextData?.props?.pageProps;
    const member = findQueryData(nextData, 'member');

    // 公开页面的 member query 为 null；登录后这里会包含当前会员对象。
    return Boolean(member || pageProps?.member || pageProps?.currentMember);
  }

  function extractCompanyCandidates(nextData, query) {
    const nodes =
      findQueryData(nextData, 'companies')?.companies?.nodes ?? [];

    return nodes
      .map((company) => ({
        id: company.id,
        name: company.name,
        confidence: calculateCompanyConfidence(query, company),
      }))
      .filter(
        (company) =>
          Number.isInteger(company.id) && typeof company.name === 'string',
      )
      .sort((left, right) => right.confidence - left.confidence);
  }

  function extractAnswerNodes(nextData) {
    return (
      findQueryData(nextData, 'companyAnswers')?.pages?.[0]?.company?.answers
        ?.nodes ?? []
    );
  }

  function mapAnswersToReviews(answers, companyName, companyId) {
    return answers
      .filter(
        (answer) =>
          Number.isInteger(answer.id) &&
          typeof answer.review === 'string' &&
          answer.review.trim(),
      )
      .map((answer) => {
        const metadata = {};

        if (answer.questionee?.jobType) {
          metadata.jobType = answer.questionee.jobType;
        }
        if (answer.questionee?.position) {
          metadata.position = answer.questionee.position;
        }
        if (answer.questionee?.questioneeEmploymentType?.name) {
          metadata.employmentType =
            answer.questionee.questioneeEmploymentType.name;
        }

        return {
          externalId: answer.id,
          company: companyName,
          source: '転職会議',
          reviewType: mapQuestionCode(answer.question?.code),
          title: answer.question?.name ?? '企業口コミ',
          content: answer.review.trim(),
          rating:
            typeof answer.rating === 'number'
              ? { overall: answer.rating }
              : undefined,
          postedAt: answer.postAt ?? undefined,
          url: `${BASE_URL}/companies/${companyId}/answers/${answer.id}`,
          metadata:
            Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      });
  }

  function calculateCompanyConfidence(query, company) {
    const normalizedQuery = normalizeCompanyName(query);
    const names = [
      company.name,
      company.oldCompanyName,
      company.commonlyKnownName,
    ]
      .filter(Boolean)
      .map(normalizeCompanyName);

    if (names.includes(normalizedQuery)) {
      return 1;
    }
    if (names.some((name) => name.includes(normalizedQuery))) {
      return 0.85;
    }
    if (names.some((name) => normalizedQuery.includes(name))) {
      return 0.75;
    }
    return 0.5;
  }

  function normalizeCompanyName(value) {
    return value
      .normalize('NFKC')
      .replace(/株式会社|有限会社|合同会社|\s+/g, '')
      .toLocaleLowerCase('ja-JP');
  }

  function mapQuestionCode(code) {
    switch (code) {
      case 'examination':
        return 'interview';
      case 'worklife':
      case 'employee':
      case 'president':
      case 'woman':
      case 'welfare':
        return 'work-environment';
      case 'skill':
        return 'technology';
      case 'earns':
        return 'salary';
      case 'leave':
        return 'exit-reason';
      default:
        return 'company-review';
    }
  }

  return {
    parseNextData,
    isLoggedIn,
    extractCompanyCandidates,
    extractAnswerNodes,
    mapAnswersToReviews,
  };
});
