const TEST_QUERY = 'test2026';

const TEST_COMPANIES = [
  {
    key: 'test-2026-01',
    name: '名企服务测试科技有限公司',
    code: '91520100MA7TEST260',
    legalPerson: '测试用户',
    regCapital: '人民币 500 万元',
    estiblishTime: '2026-01-08',
    regStatus: '存续',
    known: true,
    isTest: true,
    sourceLabel: '测试数据'
  },
  {
    key: 'test-2026-02',
    name: '贵州测试二零二六企业服务有限公司',
    code: '91520115MA7TEST261',
    legalPerson: '体验账号',
    regCapital: '人民币 100 万元',
    estiblishTime: '2025-12-26',
    regStatus: '存续',
    known: true,
    isTest: true,
    sourceLabel: '测试数据'
  }
];

function getCompanyTestResults(query) {
  if (String(query || '').trim().toLowerCase() !== TEST_QUERY) return null;
  return TEST_COMPANIES.map((company) => ({ ...company }));
}

module.exports = { TEST_QUERY, getCompanyTestResults };
