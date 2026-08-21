// 读取 fetch_data.js 产出的 kdocs_data.json（含 records 数组），聚合为 daily_data.json
// 日期来源：records[].submitTime（提交时间 col0），缺失时回退 records[].fillId（填写ID col1）的 YYYYMMDD 前缀
const fs = require('fs');
const BASE = 'C:/Users/WinTeringplus/WorkBuddy/2026-07-06-17-20-54/dashboard';
const src = JSON.parse(fs.readFileSync(BASE + '/kdocs_data.json', 'utf8'));
const records = src.records || [];

const pad = n => String(n).padStart(2, '0');
function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // YYYYMMDD 前缀兜底
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const byDay = {}, byDayChan = {}, byDayDept = {}, byDayPerson = {}, byMonth = {}, topPersons = {};
// 人员/部门改名映射（持久化：每日刷新从 kdocs 重新聚合时，旧名也会被统一改为新名）
const REMAP = { '客户部-许燕青': '客户部-李坤' };
const norm = s => REMAP[s] || s;
let skipped = 0, used = 0;
for (const r of records) {
  let d = parseDate(r.reportDate) || parseDate(r.submitTime);
  if (!d) d = parseDate(r.fillId);
  if (!d) { skipped++; continue; }
  used++;
  const ym = d.slice(0, 7);
  byDay[d] = (byDay[d] || 0) + 1;
  byMonth[ym] = (byMonth[ym] || 0) + 1;
  const ch = r.channel || '未知';
  (byDayChan[d] = byDayChan[d] || {})[ch] = ((byDayChan[d][ch] || 0) + 1);
  const dp = norm(r.dept || '未知');
  (byDayDept[d] = byDayDept[d] || {})[dp] = ((byDayDept[d][dp] || 0) + 1);
  const pk = norm(r.name || '未知') + '||' + norm(r.dept || '未知');
  (byDayPerson[d] = byDayPerson[d] || {})[pk] = ((byDayPerson[d][pk] || 0) + 1);
  (topPersons[d] = topPersons[d] || {})[pk] = ((topPersons[d][pk] || 0) + 1);
}

const out = { byDay, byDayChan, byDayDept, byDayPerson, byMonth, topPersons };
if (records.length < 30000) {
  fs.writeFileSync(BASE + '/refresh_log.txt',
    `REFUSE: records=${records.length} < 30000, NOT overwriting daily_data.json\n`, 'utf8');
  console.error('REFUSE: only ' + records.length + ' records, keep previous daily_data.json');
  process.exit(2);
}
fs.writeFileSync(BASE + '/daily_data.json', JSON.stringify(out, '', '  '), 'utf8');
const total = Object.values(byDay).reduce((a, b) => a + b, 0);
const days = Object.keys(byDay).sort();
fs.writeFileSync(BASE + '/refresh_log.txt',
  `refreshed used=${used} skipped=${skipped} total=${total} days=${days.length} range=${days[0]}~${days[days.length-1]}\n`, 'utf8');
