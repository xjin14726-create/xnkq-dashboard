// 金山文档「好评登记」抓取脚本
// 默认（无参数）：全量抓取 rowFrom=2 到末尾，重建 kdocs_data.json —— 用于初始化/兜底
// --incr：增量抓取，探测末尾后只拉最近窗口(8000行)，按 fillId 去重合并进已有 kdocs_data.json —— 用于每日例行
// --force：跳过 <30000 保护，强制写入
const fs = require('fs');
const {execSync} = require('child_process');
const path = require('path');

const cli = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\WinTeringplus\\AppData\\Local', 'kdocs-cli', 'kdocs-cli.exe');
const fileId = 'HzD6yZNFfxMSv4VKhJRyrx4quhB6r5v7M';
const outDir = 'C:\\Users\\WinTeringplus\\WorkBuddy\\2026-07-06-17-20-54\\dashboard';
const INCR = process.argv.includes('--incr');
const FORCE = process.argv.includes('--force');

function callKdocs(service, action, params) {
  const tmpReq = path.join(process.env.TEMP, 'kdocs_req.json');
  const tmpOut = path.join(process.env.TEMP, 'kdocs_out.json');
  fs.writeFileSync(tmpReq, JSON.stringify(params), 'utf8');
  try {
    execSync('"' + cli + '" ' + service + ' ' + action + ' --file "' + tmpReq + '" --silent --compact > "' + tmpOut + '"', {
      encoding: 'utf8', timeout: 60000, maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']
    });
    const raw = fs.readFileSync(tmpOut, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function extractRows(rangeData, colFrom, colTo, rowFrom, rowTo) {
  const grid = {};
  if (rangeData) rangeData.forEach(cell => {
    const key = cell.rowFrom + '_' + cell.colFrom;
    grid[key] = cell.understandableType ? cell.understandableType.value : (cell.cellText || '');
  });
  const rows = [];
  for (let r = rowFrom; r <= rowTo; r++) {
    const row = [];
    let hasData = false;
    for (let c = colFrom; c <= colTo; c++) {
      const val = grid[r + '_' + c] || '';
      row.push(val);
      if (val) hasData = true;
    }
    if (hasData) rows.push({ r, row });
  }
  return rows;
}

const knownHeaders = {
  0: '提交时间', 1: '填写ID', 2: '答题时间', 3: '昵称',
  4: '请填写您的名字', 5: '请填写您所在的部门', 6: '请填写顾客的名字',
  7: '请填写评价渠道', 8: '请选择是基础好评还是优质好评', 9: '请填写上报时间',
  10: '是否优质好评(已删除)'
};

function readTargets() {
  const t = callKdocs('sheet', 'get-range-data', { file_id: fileId, sheetId: 3, range: { rowFrom: 0, rowTo: 12, colFrom: 0, colTo: 7 } });
  return t && t.detail ? extractRows(t.detail.rangeData, 0, 7, 0, 12).map(x => x.row) : [];
}
function readMonthly() {
  const m = callKdocs('sheet', 'get-range-data', { file_id: fileId, sheetId: 4, range: { rowFrom: 0, rowTo: 53, colFrom: 0, colTo: 6 } });
  return m && m.detail ? extractRows(m.detail.rangeData, 0, 6, 0, 53).map(x => x.row) : [];
}
function toRecord(row) {
  return {
    submitTime: row[0] || '', fillId: row[1] || '', name: row[4] || '',
    dept: row[5] || '', customerName: row[6] || '', channel: row[7] || '',
    reviewType: row[8] || '', reviewDate: row[9] || ''
  };
}

// 从 startGuess 起步进探测最后有数据的行号
function probeEnd(startGuess) {
  let probe = startGuess;
  let lastNonEmpty = 2;
  for (let i = 0; i < 60; i++) {
    const batch = callKdocs('sheet', 'get-range-data', {
      file_id: fileId, sheetId: 1, range: { rowFrom: probe, rowTo: probe + 4999, colFrom: 0, colTo: 9 }
    });
    const rows = batch && batch.detail ? extractRows(batch.detail.rangeData, 0, 9, probe, probe + 4999) : [];
    if (rows.length > 0) { lastNonEmpty = rows[rows.length - 1].r; probe = lastNonEmpty + 1; }
    else break;
  }
  return lastNonEmpty;
}

function loadOldRecords() {
  try { return JSON.parse(fs.readFileSync(path.join(outDir, 'kdocs_data.json'), 'utf8')).records || []; }
  catch (e) { return []; }
}

async function main() {
  const result = { headers: {}, targets: readTargets(), monthlyProgress: readMonthly(), records: [] };
  const hdr = callKdocs('sheet', 'get-range-data', { file_id: fileId, sheetId: 1, range: { rowFrom: 1, rowTo: 1, colFrom: 0, colTo: 25 } });
  if (hdr && hdr.detail) hdr.detail.rangeData.forEach(c => { result.headers[c.colFrom] = c.cellText || ''; });
  Object.keys(knownHeaders).forEach(k => { if (!result.headers[k] || result.headers[k].length < 2) result.headers[k] = knownHeaders[k]; });

  let startRow, endRow, mode;
  if (INCR) {
    const old = loadOldRecords();
    const guess = Math.max(30000, old.length + 2);
    endRow = probeEnd(guess);
    const WINDOW = 8000;
    startRow = Math.max(2, endRow - WINDOW);
    mode = 'incr';
    console.error('INCR mode: startRow=' + startRow + ' endRow=' + endRow + ' (window=' + (endRow - startRow + 1) + ')');
  } else {
    endRow = probeEnd(30000);
    startRow = 2;
    mode = 'full';
    console.error('FULL mode: startRow=2 endRow=' + endRow);
  }

  const batchSize = 2000;
  let totalNew = 0, emptyBatch = 0;
  const newRecords = [];
  for (let s = startRow; s <= endRow; s += batchSize) {
    const e = Math.min(s + batchSize - 1, endRow);
    let batch = callKdocs('sheet', 'get-range-data', { file_id: fileId, sheetId: 1, range: { rowFrom: s, rowTo: e, colFrom: 0, colTo: 9 } });
    if (!batch || !batch.detail) {
      const r2 = callKdocs('sheet', 'get-range-data', { file_id: fileId, sheetId: 1, range: { rowFrom: s, rowTo: e, colFrom: 0, colTo: 9 } });
      if (r2 && r2.detail) batch = r2; else { console.error('fail at ' + s + ', skipping'); continue; }
    }
    const rows = batch && batch.detail ? extractRows(batch.detail.rangeData, 0, 9, s, e) : [];
    if (rows.length === 0) {
      emptyBatch++;
      if (emptyBatch >= 10) { console.error('10 empty batches, stop at ' + s); break; }
      continue;
    }
    emptyBatch = 0;
    rows.forEach(x => newRecords.push(toRecord(x.row)));
    totalNew += rows.length;
  }
  console.error('Fetched new records: ' + totalNew);

  let finalRecords;
  if (INCR && !FORCE) {
    const old = loadOldRecords();
    const map = new Map();
    old.forEach(r => { const k = r.fillId || (r.submitTime + '|' + r.name); if (k) map.set(k, r); });
    newRecords.forEach(r => { const k = r.fillId || (r.submitTime + '|' + r.name); if (k) map.set(k, r); else map.set('_' + map.size, r); });
    finalRecords = Array.from(map.values());
    console.error('Merged: old=' + old.length + ' +new=' + newRecords.length + ' => ' + finalRecords.length);
  } else {
    finalRecords = newRecords;
    console.error('Rebuilt: ' + finalRecords.length + ' records');
  }

  if (finalRecords.length < 30000 && !FORCE) {
    console.error('WARN: only ' + finalRecords.length + ' records (<30000), NOT overwriting kdocs_data.json');
    process.exit(2);
  }
  result.records = finalRecords;
  fs.writeFileSync(path.join(outDir, 'kdocs_data.json'), JSON.stringify(result), 'utf8');
  console.error('Wrote kdocs_data.json: ' + finalRecords.length + ' records (' + mode + ')');
}
main().catch(e => { console.error(e); process.exit(1); });
