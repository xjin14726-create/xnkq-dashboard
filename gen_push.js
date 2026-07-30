const fs = require('fs');
const BASE = 'C:\\Users\\WinTeringplus\\WorkBuddy\\2026-07-06-17-20-54\\dashboard';
const PATH = BASE + '\\daily_data.json';
const WEBHOOK = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=150c0f64-fecc-4ace-b8f2-fd55cdf04328";
const DASHBOARD = "https://dashboard.xnkq.net";
const DEPT_TARGET = {"洁牙组":800,"全科部":400,"儿科":100,"正畸科":200,"客户部-许燕青":200};
const MONTH_TARGET = Object.values(DEPT_TARGET).reduce((a,b)=>a+b,0);

const D = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const pad = n => String(n).padStart(2,'0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function daterange(s,e){const r=[];let c=new Date(s);while(c<=e){r.push(new Date(c));c.setDate(c.getDate()+1);}return r;}

const now = new Date();
const report = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1); // 昨日
const dayBefore = new Date(report); dayBefore.setDate(report.getDate()-1);
const rs = fmt(report), ds = fmt(dayBefore);

const yesterday = D.byDay[rs]||0;
const prev = D.byDay[ds]||0;
const dodDelta = yesterday - prev;
const dodPct = prev ? Math.round(dodDelta/prev*1000)/10 : 0;

const mStart = new Date(report.getFullYear(), report.getMonth(), 1);
const monthToDate = daterange(mStart, report).reduce((s,d)=>s+(D.byDay[fmt(d)]||0),0);
const monthRate = Math.round(monthToDate/MONTH_TARGET*1000)/10;

const dim = new Date(report.getFullYear(), report.getMonth()+1, 0).getDate();
const timeProg = report.getDate()/dim*100;

let deptProgress = Object.entries(DEPT_TARGET).map(([dept,tgt])=>{
  const comp = daterange(mStart, report).reduce((s,d)=>s+((D.byDayDept[fmt(d)]||{})[dept]||0),0);
  const rate = tgt ? Math.round(comp/tgt*1000)/10 : 0;
  return {dept, comp, tgt, rate, lag: rate < timeProg*0.8};
});
deptProgress.sort((a,b)=>b.rate-a.rate);

const ch = D.byDayChan[rs]||{};
const channels = Object.entries(ch).sort((a,b)=>b[1]-a[1]);
const chanTotal = channels.reduce((s,c)=>s+c[1],0)||1;

const pp = D.byDayPerson[rs]||{};
const topPersons = Object.entries(pp).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({name:k.split('||')[0],count:v}));

function bar(rate){const f=Math.max(0,Math.min(10,Math.round(rate/10)));return '['+'█'.repeat(f)+'░'.repeat(10-f)+']';}

const L=[];
L.push(`好评日报 | ${report.getMonth()+1}月${report.getDate()}日`);
L.push("成都西南口腔医院 · 本地电商运营");
L.push(`统计日：${rs}（昨日）　生成时间：${new Date().toISOString().slice(0,16).replace('T',' ')}`);
L.push("");
L.push("【昨日概览】");
L.push(`・昨日好评：${yesterday} 条`);
const arrow = dodDelta>=0?'▲':'▼';
L.push(`・前日好评：${prev} 条　日环比 ${arrow}${dodPct}%（${dodDelta>=0?'+':''}${dodDelta} 条）`);
L.push(`・月度累计：${monthToDate} / ${MONTH_TARGET} 条（完成 ${monthRate}%）`);
L.push("");
L.push("【部门当月进度】（目标=全月）");
deptProgress.forEach((d,i)=>{L.push(`${i+1}. ${d.dept}　${d.comp}/${d.tgt}　${bar(d.rate)} ${d.rate}%${d.lag?' ⚠滞后':''}`);});
L.push("");
L.push("【昨日渠道】");
channels.forEach(([n,c])=>{L.push(`・${n}：${c} 条（${Math.round(c/chanTotal*1000)/10}%）`);});
L.push("");
L.push("【昨日 TOP3】");
topPersons.forEach((p,i)=>{L.push(`${i+1}. ${p.name}：${p.count} 条`);});
L.push("");
L.push("———————————");
L.push("数据来源：金山文档「好评登记」");
L.push(`查看完整看板 👉 ${DASHBOARD}`);

const content = L.join("\n");
fs.writeFileSync(BASE+'\\push_content.txt', content, 'utf8');
console.log(content);

if (process.argv.includes('send')) {
  fetch(WEBHOOK, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({msgtype:'text', text:{content}})})
    .then(r=>r.text())
    .then(t=>{console.log("WEBHOOK_RESP:", t); fs.appendFileSync(BASE+'\\push_content.txt', "\n\nWEBHOOK_RESP: "+t, 'utf8');})
    .catch(e=>{console.log("SEND_ERROR:", e.message);});
} else {
  console.log("\n[dry-run] 未发送，加 send 参数执行实际推送");
}
