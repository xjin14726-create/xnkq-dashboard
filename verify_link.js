// verify_link.js — 核对线上看板(dashboard.xnkq.net)与本地 daily_data.json 是否一致
// 用法: node verify_link.js
// 退出码: 0=一致(VERIFY_OK)  1=不一致(VERIFY_MISMATCH)  2=取数失败(VERIFY_FAIL)
const https = require('https');
const fs = require('fs');

const SITE = 'https://dashboard.xnkq.net/';
const pad = n => String(n).padStart(2, '0');
const report = new Date();
report.setDate(report.getDate() - 1); // 昨日
const rs = `${report.getFullYear()}-${pad(report.getMonth() + 1)}-${pad(report.getDate())}`;

function loadLocal() {
  try { return JSON.parse(fs.readFileSync('daily_data.json', 'utf8')); }
  catch (e) { console.log('VERIFY_FAIL 读取 daily_data.json 失败: ' + e.message); process.exit(2); }
}
function fetchSite(cb) {
  https.get(SITE, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => {
      const m = d.match(/const D=(\{[\s\S]*?\});/);
      if (!m) return cb(new Error('页面未找到 const D（站点可能正在重建）'));
      try { cb(null, JSON.parse(m[1])); } catch (e) { cb(new Error('const D 解析失败: ' + e.message)); }
    });
  }).on('error', e => cb(new Error('请求站点失败: ' + e.message)));
}

const D = loadLocal();
const localByDay = D.byDay || {};
fetchSite((err, live) => {
  if (err) { console.log('VERIFY_FAIL ' + err.message); process.exit(2); }
  const liveByDay = live.byDay || {};

  // 比对最近 14 天（覆盖昨日及前后）
  const days = Object.keys(localByDay).sort().slice(-14);
  const mism = [];
  days.forEach(day => {
    const l = localByDay[day] || 0, r = liveByDay[day] || 0;
    if (l !== r) mism.push(`${day}: 本地${l} / 线上${r}`);
  });

  // 关键：昨日必须存在且一致
  const rLocal = localByDay[rs] || 0, rLive = liveByDay[rs] || 0;
  const reportOk = (rs in localByDay) && rLocal === rLive;

  // 月度累计一致性（防止部门聚合也对不上）
  const monthOk = (D.monthToDate || 0) === (live.monthToDate || 0);

  if (mism.length === 0 && reportOk && monthOk) {
    console.log(`VERIFY_OK 昨日=${rs} 本地=${rLocal} 线上=${rLive} 月度累计=${D.monthToDate}`);
    process.exit(0);
  } else {
    console.log(`VERIFY_MISMATCH 昨日=${rs} 本地=${rLocal} 线上=${rLive} 月度累计[本地${D.monthToDate||0}/线上${live.monthToDate||0}]`);
    if (mism.length) console.log('差异日期: ' + mism.join(' | '));
    process.exit(1);
  }
});
