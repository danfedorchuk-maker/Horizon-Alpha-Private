const fs = require('fs');

const MARKETS = [
  { name: 'BRITISH POUND',      query: 'BRITISH+POUND+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'JAPANESE YEN',       query: 'JAPANESE+YEN+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'EURO FX',            query: 'EURO+FX+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'SWISS FRANC',        query: 'SWISS+FRANC+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'CANADIAN DOLLAR',    query: 'CANADIAN+DOLLAR+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'AUSTRALIAN DOLLAR',  query: 'AUSTRALIAN+DOLLAR+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'NEW ZEALAND DOLLAR', query: 'NEW+ZEALAND+DOLLAR+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'GOLD',               query: 'GOLD+-+COMMODITY+EXCHANGE+INC.' },
  { name: 'CRUDE OIL',          query: 'CRUDE+OIL%2C+LIGHT+SWEET-WTI+-+ICE+FUTURES+EUROPE' },
  { name: 'S&P 500',            query: 'S%26P+500+STOCK+INDEX+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'BITCOIN',            query: 'BITCOIN+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'NASDAQ',             query: 'NASDAQ+MINI+-+CHICAGO+MERCANTILE+EXCHANGE' },
  { name: 'RUSSELL',            query: 'RUSSELL+E-MINI+-+CHICAGO+MERCANTILE+EXCHANGE' },
];

async function fetchCOT(query) {
  const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=market_and_exchange_names=%27${query}%27&$order=report_date_as_yyyy_mm_dd+DESC&$limit=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data || data.length === 0) return null;
  const d = data[0];
  return {
    date:      d.report_date_as_yyyy_mm_dd,
    oi:        parseInt(d.open_interest_all || 0),
    longSpec:  parseInt(d.noncomm_positions_long_all || 0),
    shortSpec: parseInt(d.noncomm_positions_short_all || 0),
    longComm:  parseInt(d.comm_positions_long_all || 0),
    shortComm: parseInt(d.comm_positions_short_all || 0),
  };
}

async function main() {
  console.log('Fetching COT data from CFTC...');
  const results = {};
  let reportDate = '';

  for (const market of MARKETS) {
    try {
      const d = await fetchCOT(market.query);
      if (d) {
        results[market.name] = { oi: d.oi, longSpec: d.longSpec, shortSpec: d.shortSpec, longComm: d.longComm, shortComm: d.shortComm };
        if (!reportDate) reportDate = d.date;
        console.log(`✓ ${market.name}: OI=${d.oi}`);
      } else {
        console.log(`✗ ${market.name}: No data`);
        results[market.name] = { oi: 0, longSpec: 0, shortSpec: 0, longComm: 0, shortComm: 0 };
      }
    } catch (e) {
      console.log(`✗ ${market.name}: ${e.message}`);
      results[market.name] = { oi: 0, longSpec: 0, shortSpec: 0, longComm: 0, shortComm: 0 };
    }
  }

  if (!reportDate) {
    console.log('ERROR: No report date found. Aborting.');
    process.exit(1);
  }

  const r = results;
  const lines = [
    `  const COT_REPORT_DATE = "${reportDate}";`,
    `  const COT_DATA = {`,
    `    "BRITISH POUND":      { oi: ${r['BRITISH POUND'].oi}, longSpec: ${r['BRITISH POUND'].longSpec}, shortSpec: ${r['BRITISH POUND'].shortSpec}, longComm: ${r['BRITISH POUND'].longComm}, shortComm: ${r['BRITISH POUND'].shortComm} },`,
    `    "JAPANESE YEN":       { oi: ${r['JAPANESE YEN'].oi}, longSpec: ${r['JAPANESE YEN'].longSpec}, shortSpec: ${r['JAPANESE YEN'].shortSpec}, longComm: ${r['JAPANESE YEN'].longComm}, shortComm: ${r['JAPANESE YEN'].shortComm} },`,
    `    "EURO FX":            { oi: ${r['EURO FX'].oi}, longSpec: ${r['EURO FX'].longSpec}, shortSpec: ${r['EURO FX'].shortSpec}, longComm: ${r['EURO FX'].longComm}, shortComm: ${r['EURO FX'].shortComm} },`,
    `    "SWISS FRANC":        { oi: ${r['SWISS FRANC'].oi}, longSpec: ${r['SWISS FRANC'].longSpec}, shortSpec: ${r['SWISS FRANC'].shortSpec}, longComm: ${r['SWISS FRANC'].longComm}, shortComm: ${r['SWISS FRANC'].shortComm} },`,
    `    "CANADIAN DOLLAR":    { oi: ${r['CANADIAN DOLLAR'].oi}, longSpec: ${r['CANADIAN DOLLAR'].longSpec}, shortSpec: ${r['CANADIAN DOLLAR'].shortSpec}, longComm: ${r['CANADIAN DOLLAR'].longComm}, shortComm: ${r['CANADIAN DOLLAR'].shortComm} },`,
    `    "AUSTRALIAN DOLLAR":  { oi: ${r['AUSTRALIAN DOLLAR'].oi}, longSpec: ${r['AUSTRALIAN DOLLAR'].longSpec}, shortSpec: ${r['AUSTRALIAN DOLLAR'].shortSpec}, longComm: ${r['AUSTRALIAN DOLLAR'].longComm}, shortComm: ${r['AUSTRALIAN DOLLAR'].shortComm} },`,
    `    "NEW ZEALAND DOLLAR": { oi: ${r['NEW ZEALAND DOLLAR'].oi}, longSpec: ${r['NEW ZEALAND DOLLAR'].longSpec}, shortSpec: ${r['NEW ZEALAND DOLLAR'].shortSpec}, longComm: ${r['NEW ZEALAND DOLLAR'].longComm}, shortComm: ${r['NEW ZEALAND DOLLAR'].shortComm} },`,
    `    "GOLD":               { oi: ${r['GOLD'].oi}, longSpec: ${r['GOLD'].longSpec}, shortSpec: ${r['GOLD'].shortSpec}, longComm: ${r['GOLD'].longComm}, shortComm: ${r['GOLD'].shortComm} },`,
    `    "CRUDE OIL":          { oi: ${r['CRUDE OIL'].oi}, longSpec: ${r['CRUDE OIL'].longSpec}, shortSpec: ${r['CRUDE OIL'].shortSpec}, longComm: ${r['CRUDE OIL'].longComm}, shortComm: ${r['CRUDE OIL'].shortComm} },`,
    `    "S&P 500":            { oi: ${r['S&P 500'].oi}, longSpec: ${r['S&P 500'].longSpec}, shortSpec: ${r['S&P 500'].shortSpec}, longComm: ${r['S&P 500'].longComm}, shortComm: ${r['S&P 500'].shortComm} },`,
    `    "BITCOIN":            { oi: ${r['BITCOIN'].oi}, longSpec: ${r['BITCOIN'].longSpec}, shortSpec: ${r['BITCOIN'].shortSpec}, longComm: ${r['BITCOIN'].longComm}, shortComm: ${r['BITCOIN'].shortComm} },`,
    `    "NASDAQ":             { oi: ${r['NASDAQ'].oi}, longSpec: ${r['NASDAQ'].longSpec}, shortSpec: ${r['NASDAQ'].shortSpec}, longComm: ${r['NASDAQ'].longComm}, shortComm: ${r['NASDAQ'].shortComm} },`,
    `    "RUSSELL":            { oi: ${r['RUSSELL'].oi}, longSpec: ${r['RUSSELL'].longSpec}, shortSpec: ${r['RUSSELL'].shortSpec}, longComm: ${r['RUSSELL'].longComm}, shortComm: ${r['RUSSELL'].shortComm} },`,
    `  };`,
  ];
  const newBlock = '// COT_BLOCK_START\n' + lines.join('\n') + '\n  // COT_BLOCK_END';

  let code = fs.readFileSync('api/analyze.js', 'utf8');
  const before = code;
  code = code.replace(/\/\/ COT_BLOCK_START[\s\S]*?\/\/ COT_BLOCK_END/, newBlock);

  if (code === before) {
    console.log('ERROR: COT_BLOCK_START/END markers not found in api/analyze.js. Aborting.');
    process.exit(1);
  }

  fs.writeFileSync('api/analyze.js', code);
  console.log(`\nDone. COT data updated to ${reportDate}`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
