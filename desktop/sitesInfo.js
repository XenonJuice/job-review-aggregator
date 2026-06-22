const JobTalkParser = require('./jobtalkParser');

// 用来存储站点信息
// todo 添加其他站点
const TARGET_REVIEW_SITES = {
  'tenshoku-kaigi': {
    id: 'tenshoku-kaigi',
    displayName: '転職会議',
    baseUrl: 'https://jobtalk.jp',
    homeUrl: 'https://jobtalk.jp/',
    loginCheckUrl: 'https://jobtalk.jp/companies/2513/answers?page=1',
    parser: JobTalkParser,
  },
};

module.exports = {
  TARGET_REVIEW_SITES,
};
