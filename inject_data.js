// 永久脚本：把 daily_data.json 注入 index.html 的 const D={...} 数据块
// 用法：node inject_data.js（自动化每日调用，勿删除）
const fs = require('fs');
const path = require('path');
const D = __dirname;
const html = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(D, 'daily_data.json'), 'utf8'));
const marker = 'const D={';
const start = html.indexOf(marker);
if (start === -1) { console.error('MARKER NOT FOUND'); process.exit(1); }
let depth = 0, end = start;
for (let i = start + marker.length - 1; i < html.length; i++) {
  if (html[i] === '{') depth++;
  else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const newHtml = html.slice(0, start) + 'const D=' + JSON.stringify(data) + ';' + html.slice(end);
fs.writeFileSync(path.join(D, 'index.html'), newHtml, 'utf8');
console.log('INJECT_OK bytes=' + JSON.stringify(data).length);
