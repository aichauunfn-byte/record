/* 隨手記帳 — 核心：資料、工具、記一筆表單、同步 */
(function () {
  'use strict';
  var R = window.R = {};

  var CATS = {
    expense: ['餐飲', '交通', '購物', '居家', '娛樂', '醫療', '學習', '保險', '分期', '其他'],
    income: ['薪資', '獎金', '投資', '其他']
  };
  var CAT_COLORS = ['#f0836f', '#f0a63f', '#6fd3a4', '#6fb4f0', '#c79cf0', '#f06fa8', '#4fd3d3', '#9aa09d', '#d3c14f', '#7f8c8a'];
  var CURS = {
    TWD: { sym: 'NT$', dec: 0, name: '台幣' }, JPY: { sym: '¥', dec: 0, name: '日圓' },
    USD: { sym: 'US$', dec: 2, name: '美元' }, EUR: { sym: '€', dec: 2, name: '歐元' },
    CNY: { sym: 'CN¥', dec: 2, name: '人民幣' }, HKD: { sym: 'HK$', dec: 2, name: '港幣' },
    KRW: { sym: '₩', dec: 0, name: '韓元' }, GBP: { sym: '£', dec: 2, name: '英鎊' },
    AUD: { sym: 'A$', dec: 2, name: '澳幣' }, SGD: { sym: 'S$', dec: 2, name: '新加坡幣' }
  };
  var KEYWORDS = {
    '餐飲': ['早餐', '午餐', '晚餐', '宵夜', '吃', '飯', '麵', '便當', '咖啡', '飲料', '茶', '餐', '火鍋', '麥當勞'],
    '交通': ['捷運', '公車', '高鐵', '台鐵', '火車', '計程車', 'uber', '加油', '油錢', '停車', '過路費', '機票', '悠遊卡'],
    '購物': ['買', '蝦皮', 'momo', '網購', '衣服', '鞋', '日用品', '超市', '全聯', '家樂福'],
    '居家': ['房租', '水費', '電費', '瓦斯', '網路費', '電話費', '管理費', '家具', '傢俱'],
    '娛樂': ['電影', '遊戲', 'KTV', '唱歌', '旅遊', '門票', '訂閱', 'netflix'],
    '醫療': ['看醫生', '診所', '醫院', '藥', '掛號', '牙醫', '健檢'],
    '學習': ['書', '課程', '學費', '補習', '教材'],
    '保險': ['保險', '保費', '健保', '勞保']
  };
  var POL_FREQ = { 1: '每月', 3: '每季', 6: '每半年', 12: '每年' };
  var KIND_NAME = { '': '一般帳戶', card: '信用卡', invest: '投資帳戶' };

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      var v = props[k];
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = [].concat(arguments[i]);
      for (var j = 0; j < kids.length; j++) {
        var c = kids[j];
        if (c == null || c === false) continue;
        el.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    }
    return el;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function today0() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function mdt(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmt(n, cur) {
    var c = CURS[cur] || CURS.TWD;
    return c.sym + ' ' + Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
  }
  function sfmt(n, cur) {
    var c = CURS[cur] || CURS.TWD;
    var neg = n < 0 && Math.round(Math.abs(n) * Math.pow(10, c.dec)) > 0;
    return (neg ? '−' : '') + fmt(n, cur);
  }
  function roundCur(n, cur) { var c = CURS[cur] || CURS.TWD; return c.dec === 0 ? Math.round(n) : Math.round(n * 100) / 100; }
  function parseAmount(s) {
    var t = String(s).replace(/[,，\s]/g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * 100) / 100;
  }
  function newId(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function catColor(type, cat) {
    if (type === 'income') return '#5cc9a7';
    var i = CATS.expense.indexOf(cat);
    return CAT_COLORS[i < 0 ? 9 : i];
  }

  /* ---------- 資料 ---------- */
  var D = R.D = { entries: [], accounts: [], policies: [], family: [], rates: {} };
  var cfg = R.cfg = load('rec.cfg', {});
  if (typeof cfg.who !== 'string') cfg.who = '';
  if (typeof cfg.url !== 'string') cfg.url = '';
  if (typeof cfg.token !== 'string') cfg.token = '';
  var UI = R.UI = { tab: 'list', ym: new Date(), filterAcct: null, filterWho: null };

  function saveAll() { store('rec.v3', { e: D.entries, a: D.accounts, p: D.policies, f: D.family, r: D.rates }); }
  function saveCfg() { store('rec.cfg', { who: cfg.who, url: cfg.url, token: cfg.token }); }

  function loadAll() {
    var v3 = load('rec.v3', null);
    if (v3) {
      D.entries = v3.e || []; D.accounts = v3.a || []; D.policies = v3.p || [];
      D.family = v3.f || []; D.rates = v3.r || {};
      return;
    }
    migrate();
  }
  // 從第一版（簡易記帳）搬資料：帳戶名稱字串 → 帳戶物件，紀錄 → 明細；舊的「分期」→ 信用卡分期
  function migrate() {
    var oldCfg = load('rec.cfg', {}), oldRecs = load('rec.records', []);
    var names = (oldCfg.accounts && oldCfg.accounts.length) ? oldCfg.accounts : ['現金'];
    var map = {};
    names.forEach(function (s, i) {
      var m = s.match(/[（(]([A-Z]{3})[）)]/);
      var a = { id: newId('a_') + i, name: s, bank: '', cur: m && CURS[m[1]] ? m[1] : 'TWD', opening: 0, ts: Date.now() + i };
      if (/卡/.test(s)) a.kind = 'card';
      D.accounts.push(a); map[s] = a.id;
    });
    function accId(name) {
      if (name && map[name]) return map[name];
      if (!name) return D.accounts[0].id;
      var a = { id: newId('a_'), name: name, bank: '', cur: 'TWD', opening: 0, ts: Date.now() };
      D.accounts.push(a); map[name] = a.id; return a.id;
    }
    oldRecs.forEach(function (r, i) {
      var ts = Date.parse(r.created) || (Date.now() + i);
      if (r.type === '分期') {
        var aid = accId(r.account), acc = D.accounts.filter(function (x) { return x.id === aid; })[0];
        acc.kind = 'card';
        var sp = instSplit(r.amount, r.periods, acc.cur);
        D.policies.push({ id: 'p_' + r.id, ts: ts, name: r.note || '分期', kind: 'inst', acct: aid, freq: 1,
          amount: sp.per, firstAmt: sp.first, first: r.date, total: r.periods, autoRec: true, autoK: -1, since: r.date, holder: '', insured: '' });
        return;
      }
      var e = { id: r.id, type: r.type === '收入' ? 'income' : r.type === '轉帳' ? 'transfer' : 'expense',
        amount: r.amount, date: r.date, note: r.note || '', ts: ts, by: r.who || '', synced: !!r.synced, created: r.created };
      if (e.type === 'transfer') { e.from = accId(r.account); e.to = accId(r.toAccount); }
      else { e.cat = r.category || '其他'; e.acct = accId(r.account); }
      D.entries.push(e);
    });
    saveAll();
  }

  /* ---------- 帳戶、匯率、餘額 ---------- */
  function sortedAccounts() { return D.accounts.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }); }
  function findAcct(id) { return D.accounts.filter(function (x) { return x.id === id; })[0]; }
  function acctCur(id) { var a = findAcct(id); return a && CURS[a.cur] ? a.cur : 'TWD'; }
  function fullName(a) { return a.bank ? a.bank + ' ' + a.name : a.name; }
  function acctName(id) {
    if (!id) return '';
    if (id === '__ext') return '其他帳戶（未納入管理）';
    if (String(id).indexOf('x:') === 0) return id.slice(2) + '（其他帳戶）';
    var a = findAcct(id); return a ? fullName(a) : '（已刪除帳戶）';
  }
  function isExt(id) { return id === '__ext' || String(id).indexOf('x:') === 0; }
  function usesAcct(id) {
    return D.entries.filter(function (e) { return e.type === 'transfer' ? (e.from === id || e.to === id) : e.acct === id; }).length +
      D.policies.filter(function (p) { return p.acct === id; }).length;
  }
  function toAmt(e) { return e.toAmount > 0 ? e.toAmount : e.amount; }
  function rateOf(cur) { return cur === 'TWD' ? 1 : (D.rates[cur] > 0 ? D.rates[cur] : 0); }
  function entryRate(e) {
    var cur = acctCur(e.acct);
    if (cur === 'TWD') return 1;
    return e.rate > 0 ? e.rate : rateOf(cur);
  }
  function dispCur() { return UI.filterAcct ? acctCur(UI.filterAcct) : 'TWD'; }
  function val(e) { return UI.filterAcct ? e.amount : e.amount * entryRate(e); }
  function foreignCurs() {
    var seen = {};
    D.accounts.forEach(function (a) { if (CURS[a.cur] && a.cur !== 'TWD') seen[a.cur] = true; });
    return Object.keys(seen).sort();
  }
  function balances() {
    var b = {};
    D.accounts.forEach(function (a) { b[a.id] = isFinite(a.opening) ? a.opening : 0; });
    D.entries.forEach(function (e) {
      if (!isFinite(e.amount)) return;
      if (e.type === 'transfer') {
        if (b[e.from] !== undefined) b[e.from] -= e.amount;
        if (b[e.to] !== undefined) b[e.to] += toAmt(e);
      } else if (b[e.acct] !== undefined) b[e.acct] += e.type === 'income' ? e.amount : -e.amount;
    });
    return b;
  }
  function inFilter(e) {
    if (UI.filterWho !== null) {
      if (e.type !== 'expense') return false;
      if (UI.filterWho === '__none' ? !!e.who : e.who !== UI.filterWho) return false;
    }
    if (!UI.filterAcct) return true;
    return e.type === 'transfer' ? (e.from === UI.filterAcct || e.to === UI.filterAcct) : e.acct === UI.filterAcct;
  }
  function lacksRate(e) { return e.type !== 'transfer' && acctCur(e.acct) !== 'TWD' && !(entryRate(e) > 0); }
  function totals(list) {
    var t = { inc: 0, exp: 0 };
    list.forEach(function (e) {
      if (e.type === 'transfer') return;
      var v = lacksRate(e) && !UI.filterAcct ? 0 : val(e);
      if (e.type === 'income') t.inc += v; else t.exp += v;
    });
    return t;
  }
  function monthList(y, m) {
    var key = y + '-' + pad(m);
    return D.entries.filter(function (e) {
      return typeof e.date === 'string' && e.date.slice(0, 7) === key && isFinite(e.amount) && inFilter(e);
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }
  function whoNames() { return D.family.map(function (f) { return f.name; }); }

  /* 信用卡結帳週期 */
  function cardCycle(a) {
    var today = today0();
    function cd(y, m) { return new Date(y, m, Math.min(a.closeDay, new Date(y, m + 1, 0).getDate())); }
    var c0 = cd(today.getFullYear(), today.getMonth()), last, next;
    if (c0 < today) { last = c0; next = cd(today.getFullYear(), today.getMonth() + 1); }
    else { next = c0; last = cd(today.getFullYear(), today.getMonth() - 1); }
    var from = ymd(last), sum = 0, upto = isFinite(a.opening) ? a.opening : 0, paid = 0;
    D.entries.forEach(function (e) {
      if (!isFinite(e.amount) || typeof e.date !== 'string') return;
      var isTr = e.type === 'transfer', s = 0;
      if (isTr) { if (e.to === a.id) s += toAmt(e); if (e.from === a.id) s -= e.amount; }
      else if (e.acct === a.id) s = e.type === 'income' ? e.amount : -e.amount;
      if (!s) return;
      if (e.date <= from) upto += s; else if (isTr) paid += s; else sum -= s;
    });
    var due = null;
    if (a.dueDay > 0) {
      var dd = function (y, m) { return new Date(y, m, Math.min(a.dueDay, new Date(y, m + 1, 0).getDate())); };
      due = dd(last.getFullYear(), last.getMonth());
      if (due <= last) due = dd(last.getFullYear(), last.getMonth() + 1);
    }
    return { sum: sum, next: next, days: Math.round((next - today) / 86400000), last: last,
      billed: Math.max(0, -(upto + paid)), due: due, dueDays: due ? Math.round((due - today) / 86400000) : null };
  }

  /* ---------- 保單與分期 ---------- */
  function instSplit(total, n, cur) {
    var dec = (CURS[cur] || CURS.TWD).dec === 0 ? 1 : 100;
    var per = Math.floor(total / n * dec + 1e-9) / dec;
    var first = Math.round((total - per * (n - 1)) * dec) / dec;
    return { per: per, first: first === per ? 0 : first };
  }
  function polAmt(p, k) { return k === 0 && p.firstAmt > 0 ? p.firstAmt : p.amount; }
  function polSum(p, from) { var t = 0; for (var k = from; k < p.total; k++) t += polAmt(p, k); return t; }
  function polCat(p) { return p.cat || (p.kind === 'inst' ? '分期' : '保險'); }
  function polDate(p, k) {
    var f = String(p.first).split('-'), m = +f[1] - 1 + k * p.freq, y = +f[0];
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(+f[2], last));
  }
  function periodText(p, k) { return '第 ' + (k + 1) + ' 期' + (p.total > 0 ? ' / 共 ' + p.total + ' 期' : ''); }
  function recordedMap(p) {
    var rec = {};
    D.entries.forEach(function (e) { if (e.pol === p.id) rec[e.period] = true; });
    (p.skip || []).forEach(function (k) { rec[k] = true; });
    return rec;
  }
  function polInfo(p) {
    var t = today0(), total = p.total > 0 ? p.total : Infinity, rec = recordedMap(p), k = 0;
    while (k < total && k < 1200 && polDate(p, k) < t) k++;
    var info = { k: k, finished: k >= total, rec: rec };
    if (!info.finished) { info.date = polDate(p, k); info.days = Math.round((info.date - t) / 86400000); info.done = !!rec[k]; }
    var pk = k - 1;
    if (pk >= 0 && pk < total && !rec[pk]) {
      var pd = polDate(p, pk);
      if ((t - pd) / 86400000 <= 45) info.missed = { k: pk, date: pd, days: Math.round((pd - t) / 86400000) };
    }
    return info;
  }
  function polLeft(p) { // 還沒記錄的剩餘期數與金額（只有有固定期數的才有意義）
    var rec = recordedMap(p), n = 0, sum = 0;
    for (var k = 0; k < p.total; k++) if (!rec[k]) { n++; sum += polAmt(p, k); }
    return { n: n, sum: sum };
  }
  function recordDue(p) {
    if (p.autoRec === false || !(p.amount > 0) || !(isExt(p.acct) || findAcct(p.acct))) return 0;
    var t = today0(), made = 0, total = p.total > 0 ? p.total : Infinity, rec = recordedMap(p), since;
    if (p.since && /^\d{4}-\d{2}-\d{2}$/.test(p.since)) { var sp = p.since.split('-'); since = new Date(+sp[0], +sp[1] - 1, +sp[2]); }
    else { since = new Date(p.ts || 0); since = new Date(since.getFullYear(), since.getMonth(), since.getDate() - 3); }
    var startK = (p.autoK >= 0 ? p.autoK : -1) + 1, top = p.autoK >= 0 ? p.autoK : -1, n = 0, newSkip = [];
    for (var k = startK; k < total && k < 1200; k++) {
      var d = polDate(p, k);
      if (d > t) break;
      if (d < since || rec[k]) { top = k; continue; }
      if (n >= 24) break;
      var dsx = ymd(d), amx = polAmt(p, k);
      if (D.entries.some(function (x) { return x.type === 'expense' && x.acct === p.acct && x.date === dsx && x.amount === amx; })) {
        newSkip.push(k); R.autoSkipped++; top = k; continue;
      }
      var e = { id: 'e_auto_' + p.id + '_' + k, type: 'expense', cat: polCat(p), acct: p.acct, amount: polAmt(p, k), date: dsx,
        note: p.name + ' ' + periodText(p, k), ts: Date.now() + n, pol: p.id, period: k, by: cfg.who || '', synced: false };
      if (p.insured) e.who = p.insured;
      D.entries.push(e); made++; n++; top = k;
    }
    p.autoK = top;
    if (newSkip.length) p.skip = (p.skip || []).concat(newSkip);
    return made;
  }
  R.autoSkipped = 0;
  function autoRecordPolicies() {
    var made = 0;
    D.policies.forEach(function (p) { made += recordDue(p); });
    if (made || R.autoSkipped) {
      saveAll();
      toast((made ? '已自動記錄 ' + made + ' 筆保費 / 分期支出' : '') + (made && R.autoSkipped ? '；' : '') +
        (R.autoSkipped ? '有 ' + R.autoSkipped + ' 筆因已有相同日期、帳戶、金額的記錄而略過' : ''));
      R.autoSkipped = 0;
    }
  }
  function ensurePeople(names) {
    names.forEach(function (n) {
      n = (n || '').trim();
      if (n && n !== '家庭' && !D.family.some(function (f) { return f.name === n; })) D.family.push({ id: newId('f_'), name: n, ts: Date.now() });
    });
  }

  /* ---------- 共用對話框 ---------- */
  R.openDlg = function (title, build) {
    var d = $('dlg'); d.innerHTML = '';
    var body = h('div', {});
    d.append(h('h2', {}, title), body);
    build(body);
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  };
  R.closeDlg = function () { var d = $('dlg'); if (d.open) d.close(); };
  function field(label, input, hint) {
    return h('div', {}, h('label', {}, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
  }
  function chipRow(items, current, onPick) { // items: [{v,t,color}]
    var box = h('div', { class: 'chips' });
    items.forEach(function (it) {
      box.append(h('button', { type: 'button', class: 'chip' + (it.v === current ? ' on' : ''), onclick: function () { onPick(it.v); } },
        it.color ? h('i', { style: 'background:' + it.color }) : null, it.t));
    });
    return box;
  }
  function curOptions(sel) {
    return Object.keys(CURS).map(function (c) { return h('option', { value: c, selected: c === sel }, c + ' ' + CURS[c].name); });
  }

  /* ---------- 記一筆表單（明細頁與編輯共用） ---------- */
  function lastAcct() {
    var id = load('rec.lastAcct', '');
    if (findAcct(id)) return id;
    var a = sortedAccounts()[0]; return a ? a.id : '';
  }
  // host：放表單的容器；init：初始值；opts：{inline, onDone}
  function entryForm(host, init, opts) {
    opts = opts || {};
    var st = Object.assign({ type: 'expense', cat: '餐飲', acct: lastAcct(), to: '', who: '', date: today(), note: '', amount: '', toAmount: '', rate: '' }, init || {});
    if (st.amount !== '' && st.amount != null) st.amount = String(st.amount);
    if (st.toAmount) st.toAmount = String(st.toAmount);
    if (st.rate) st.rate = String(st.rate);
    var editing = !!st.id;
    if (!st.to || st.to === st.acct) { var o = sortedAccounts().filter(function (a) { return a.id !== st.acct; })[0]; st.to = o ? o.id : ''; }
    var rec = null;

    function draw() {
      host.innerHTML = '';
      var t = st.type;
      var tabs = h('div', { class: 'tabs' });
      [['expense', '支出'], ['income', '收入'], ['transfer', '轉帳']].concat(opts.inline ? [['inst', '分期']] : []).forEach(function (x) {
        tabs.append(h('button', { type: 'button', class: t === x[0] ? 'on' : '', onclick: function () {
          if (x[0] === 'inst') { R.openPol(null, 'inst'); return; }
          st.type = x[0];
          if (x[0] === 'expense' && CATS.expense.indexOf(st.cat) < 0) st.cat = '餐飲';
          if (x[0] === 'income' && CATS.income.indexOf(st.cat) < 0) st.cat = '薪資';
          draw();
        } }, x[1]));
      });
      tabs.style.gridTemplateColumns = 'repeat(' + (opts.inline ? 4 : 3) + ',1fr)';
      host.append(tabs);

      if (opts.inline && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
        host.append(h('button', { type: 'button', class: 'voice', id: 'voiceBtn', onclick: voice }, '🎤 語音輸入'),
          h('p', { class: 'hint' }, '按下後直接說，例如「午餐 120 國泰卡」。'));
      } else if (opts.inline) {
        host.append(h('p', { class: 'hint' }, '這個瀏覽器不支援語音辨識，請改用鍵盤上的麥克風。'));
      }
      if (!D.accounts.length) { host.append(h('p', { class: 'hint' }, '請先到「帳戶」頁新增一個帳戶，才能記帳。')); return; }

      var cur = acctCur(st.acct);
      var amtIn = h('input', { type: 'number', inputmode: 'decimal', placeholder: '0', value: st.amount, step: 'any', oninput: function () { st.amount = this.value; } });
      host.append(h('label', {}, (t === 'transfer' ? '轉出金額' : '金額') + '（' + cur + '）'), amtIn);

      if (t !== 'transfer') {
        host.append(h('label', {}, '分類'), chipRow(CATS[t].map(function (c) { return { v: c, t: c, color: catColor(t, c) }; }), st.cat, function (v) { st.cat = v; draw(); }));
      }
      var accItems = sortedAccounts().map(function (a) { return { v: a.id, t: fullName(a) }; });
      if (t !== 'transfer' && isExt(st.acct)) accItems.push({ v: st.acct, t: acctName(st.acct) });
      host.append(h('label', {}, t === 'transfer' ? '轉出帳戶' : '帳戶'),
        chipRow(accItems, st.acct, function (v) { st.acct = v; if (st.to === v) st.to = ''; draw(); }));
      if (t === 'transfer') {
        var toItems = sortedAccounts().filter(function (a) { return a.id !== st.acct; }).map(function (a) { return { v: a.id, t: fullName(a) }; });
        if (toItems.length && !toItems.some(function (x) { return x.v === st.to; })) st.to = toItems[0].v;
        host.append(h('label', {}, '轉入帳戶'), chipRow(toItems, st.to, function (v) { st.to = v; draw(); }));
        if (st.to && acctCur(st.to) !== cur) {
          host.append(h('label', {}, '轉入金額（' + acctCur(st.to) + '）'),
            h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: st.toAmount, placeholder: '換匯後入帳的金額', oninput: function () { st.toAmount = this.value; } }));
        }
      } else {
        if (cur !== 'TWD') {
          host.append(h('label', {}, '匯率（1 ' + cur + ' ＝ ? 台幣）'),
            h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: st.rate, placeholder: D.rates[cur] ? '留空＝使用預設 ' + D.rates[cur] : '請填匯率或到基本資料設定', oninput: function () { st.rate = this.value; } }));
        }
        if (t === 'expense' && D.family.length) {
          var ws = h('select', { onchange: function () { st.who = this.value; } }, h('option', { value: '' }, '不指定'),
            D.family.map(function (f) { return h('option', { value: f.name, selected: f.name === st.who }, f.name); }));
          if (st.who && !D.family.some(function (f) { return f.name === st.who; })) ws.append(h('option', { value: st.who, selected: true }, st.who));
          host.append(h('label', {}, '花在誰身上'), ws);
        }
      }
      host.append(h('div', { class: 'row2' },
        h('div', {}, h('label', {}, '日期'), h('input', { type: 'date', value: st.date, onchange: function () { st.date = this.value; } })),
        h('div', {}, h('label', {}, '備註'), h('input', { type: 'text', value: st.note, placeholder: '選填', oninput: function () { st.note = this.value; } }))));
      host.append(h('button', { type: 'button', class: 'save', onclick: submit }, editing ? '儲存修改' : '儲存'));
      if (editing) host.append(h('button', { type: 'button', class: 'danger', onclick: del }, '刪除這筆'));
    }

    function submit() {
      var cur = acctCur(st.acct), t = st.type;
      var amount = parseFloat(st.amount);
      if (!(amount > 0)) { toast('請輸入金額'); return; }
      var e = { id: st.id || newId(), type: t, amount: roundCur(amount, cur), date: st.date || today(), note: (st.note || '').trim(),
        ts: st.ts || Date.now(), by: editing ? (st.by || '') : (cfg.who || ''), synced: false, created: st.created || new Date().toISOString() };
      if (t === 'transfer') {
        if (!st.to || st.to === st.acct) { toast('轉出與轉入帳戶不能相同'); return; }
        e.from = st.acct; e.to = st.to;
        if (acctCur(st.to) !== cur) {
          var ta = parseFloat(st.toAmount);
          if (!(ta > 0)) { toast('兩個帳戶幣別不同，請填轉入金額'); return; }
          e.toAmount = roundCur(ta, acctCur(st.to));
        }
      } else {
        e.cat = st.cat; e.acct = st.acct;
        if (st.who && t === 'expense') e.who = st.who;
        var rt = parseFloat(st.rate); if (cur !== 'TWD' && rt > 0) e.rate = rt;
        if (st.pol) { e.pol = st.pol; e.period = st.period; }
      }
      if (editing) { D.entries = D.entries.map(function (x) { return x.id === e.id ? e : x; }); }
      else D.entries.push(e);
      store('rec.lastAcct', t === 'transfer' ? e.from : e.acct);
      saveAll();
      toast(editing ? '已修改' : '已儲存');
      if (opts.onDone) opts.onDone(e);
      if (opts.inline && !editing) { st.amount = ''; st.note = ''; st.toAmount = ''; st.rate = ''; st.date = today(); draw(); }
      R.render(); R.sync(true);
    }
    function del() {
      if (!confirm('刪除這筆紀錄？（已同步到試算表的資料不會被刪除）')) return;
      D.entries = D.entries.filter(function (x) { return x.id !== st.id; });
      saveAll(); R.closeDlg(); R.render(); toast('已刪除');
    }

    /* 語音 */
    var DIG = { '零': 0, '〇': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    function cnToNum(s) {
      var total = 0, section = 0, num = 0, last = 0;
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c in DIG) num = DIG[c];
        else if (c === '十') { section += (num || 1) * 10; num = 0; last = 10; }
        else if (c === '百') { section += (num || 1) * 100; num = 0; last = 100; }
        else if (c === '千') { section += (num || 1) * 1000; num = 0; last = 1000; }
        else if (c === '萬' || c === '万') { total += (section + num || 1) * 10000; section = 0; num = 0; last = 10000; }
      }
      if (num > 0 && last >= 100) num = num * (last / 10);
      return total + section + num;
    }
    function parseSpeech(text) {
      var t = text.replace(/，|,/g, '').replace(/\s+/g, ' '), amount = null;
      var m = t.match(/(\d+(?:\.\d+)?)\s*(?:元|塊|块)?/);
      if (m) amount = parseFloat(m[1]);
      else { var c = t.match(/[零〇一二兩三四五六七八九十百千萬万]+/); if (c) { var n = cnToNum(c[0]); if (n > 0) amount = n; } }
      var acc = null, low = t.toLowerCase(), accs = sortedAccounts();
      accs.forEach(function (a) {
        var base = fullName(a).replace(/（.*?）|\(.*?\)/g, '');
        if (base && low.indexOf(base.toLowerCase()) >= 0) acc = a.id;
        else if (a.name.replace(/（.*?）|\(.*?\)/g, '') && low.indexOf(a.name.replace(/（.*?）|\(.*?\)/g, '').toLowerCase()) >= 0) acc = a.id;
      });
      if (!acc) {
        if (/卡/.test(t)) { var cc = accs.filter(function (a) { return a.kind === 'card' || /卡/.test(a.name); })[0]; if (cc) acc = cc.id; }
        else if (/現金/.test(t)) { var cs = accs.filter(function (a) { return /現金/.test(a.name); })[0]; if (cs) acc = cs.id; }
      }
      var cat = null;
      Object.keys(KEYWORDS).forEach(function (k) {
        if (!cat && KEYWORDS[k].some(function (w) { return low.indexOf(w.toLowerCase()) >= 0; })) cat = k;
      });
      return { amount: amount, acc: acc, cat: cat, income: /薪水|薪資|收入|入帳|獎金|收到/.test(t) };
    }
    function voice() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'zh-TW'; rec.interimResults = false; rec.maxAlternatives = 1;
      var btn = $('voiceBtn');
      rec.onstart = function () { btn.classList.add('listening'); btn.textContent = '🎙 聆聽中…（再按一次停止）'; };
      rec.onresult = function (ev) {
        var text = ev.results[0][0].transcript, p = parseSpeech(text);
        if (p.income && st.type === 'expense') { st.type = 'income'; st.cat = '薪資'; }
        if (p.amount) st.amount = String(p.amount);
        if (p.cat && st.type === 'expense') st.cat = p.cat;
        if (p.acc) st.acc = p.acc, st.acct = p.acc;
        st.note = text; draw();
        toast(p.amount ? '已辨識：' + text : '沒聽到金額，請手動輸入');
      };
      rec.onerror = function (e) { toast(e.error === 'not-allowed' ? '麥克風被拒絕，請在瀏覽器網站設定中允許' : '語音辨識失敗：' + e.error); };
      rec.onend = function () { rec = null; var b = $('voiceBtn'); if (b) { b.classList.remove('listening'); b.textContent = '🎤 語音輸入'; } };
      try { rec.start(); } catch (e) { rec = null; }
    }
    draw();
    return { redraw: draw };
  }

  R.openEntry = function (e, pre) {
    R.openDlg(e ? '修改紀錄' : '記一筆', function (body) {
      var init = {};
      if (e) {
        init = { id: e.id, type: e.type, amount: e.amount, date: e.date, note: e.note || '', ts: e.ts, by: e.by, created: e.created,
          cat: e.cat || '其他', acct: e.type === 'transfer' ? e.from : e.acct, to: e.to || '', toAmount: e.toAmount || '', rate: e.rate || '',
          who: e.who || '', pol: e.pol, period: e.period };
      } else init = Object.assign({}, pre || {});
      entryForm(body, init, { onDone: function () { R.closeDlg(); } });
      body.append(h('button', { type: 'button', class: 'plain', onclick: R.closeDlg }, '取消'));
    });
  };

  /* ---------- 同步到 Google 試算表 ---------- */
  function toRow(e) {
    var p = e.pol ? D.policies.filter(function (x) { return x.id === e.pol; })[0] : null;
    var tr = e.type === 'transfer';
    return { id: e.id, date: e.date, type: e.type === 'income' ? '收入' : tr ? '轉帳' : '支出', amount: e.amount,
      category: tr ? '' : (e.cat || ''), account: acctName(tr ? e.from : e.acct), toAccount: tr ? acctName(e.to) : '',
      note: e.note || '', periods: p && p.kind === 'inst' ? p.total : '', created: e.created || new Date(e.ts || Date.now()).toISOString(),
      who: e.by || '', cur: acctCur(tr ? e.from : e.acct), target: e.who || '', rate: e.rate || '' };
  }
  function makeSnapshot() {
    var b = balances();
    return {
      accounts: sortedAccounts().map(function (a) {
        return { name: fullName(a), cur: a.cur, kind: KIND_NAME[a.kind || ''], opening: a.opening || 0, balance: Math.round((b[a.id] || 0) * 100) / 100,
          closeDay: a.closeDay || '', dueDay: a.dueDay || '', auto: a.kind === 'card' ? (a.auto ? '是' : '否') : '', payAcct: a.payAcct ? acctName(a.payAcct) : '' };
      }),
      policies: D.policies.map(function (p) {
        var info = polInfo(p), left = p.total > 0 ? polLeft(p) : null;
        return { name: p.name, kind: p.kind === 'inst' ? '信用卡分期' : '保單／定期扣款', holder: p.holder || '', insured: p.insured || '', insurer: p.insurer || '',
          acct: acctName(p.acct), freq: POL_FREQ[p.freq] || p.freq, amount: p.amount, firstAmt: p.firstAmt || '', first: p.first, total: p.total || '',
          leftN: left ? left.n : '', leftSum: left ? left.sum : '', next: info.finished ? '已結束' : ymd(info.date), start: p.start || '', payYears: p.payYears || '', term: p.term || '' };
      }),
      family: D.family.map(function (f) { return { name: f.name, rel: f.rel || '', birth: f.birth || '', note: f.note || '' }; }),
      rates: Object.keys(D.rates).map(function (c) { return { cur: c, rate: D.rates[c] }; })
    };
  }
  var syncing = false;
  R.sync = function (quiet) {
    if (!cfg.url) { if (!quiet) toast('請先到「基本資料」填入 Apps Script 網址'); return; }
    var pending = D.entries.filter(function (e) { return !e.synced; });
    var snap = makeSnapshot(), snapStr = JSON.stringify(snap), needSnap = snapStr !== load('rec.snap', '');
    if (!pending.length && !needSnap) { if (!quiet) toast('沒有待同步的資料'); return; }
    if (syncing) return; syncing = true;
    var payload = { token: cfg.token, records: pending.map(toRow) };
    if (needSnap) payload.snapshot = snap;
    fetch(cfg.url, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (j && j.ok) {
          var ok = {}; (j.saved || []).forEach(function (id) { ok[id] = 1; });
          D.entries.forEach(function (e) { if (ok[e.id]) e.synced = true; });
          saveAll();
          if (needSnap && j.snapshot === true) store('rec.snap', snapStr);
          R.render();
          if (!quiet) toast('已同步 ' + (j.saved || []).length + ' 筆' + (needSnap ? (j.snapshot === true ? '，並更新帳戶／保單／家人' : '（Apps Script 還是舊版，帳戶等資料未更新）') : ''));
        } else toast('同步失敗：' + ((j && j.error) || '未知錯誤'));
      })
      .catch(function () { if (!quiet) toast('同步失敗，請確認網路與網址'); })
      .then(function () { syncing = false; });
  };

  /* ---------- 匯出（共用） ---------- */
  R.download = function (name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  /* 對外 */
  R.C = { CATS: CATS, CURS: CURS, POL_FREQ: POL_FREQ, KIND_NAME: KIND_NAME, CAT_COLORS: CAT_COLORS };
  R.u = { $: $, h: h, pad: pad, ymd: ymd, today: today, today0: today0, mdt: mdt, fmt: fmt, sfmt: sfmt, roundCur: roundCur, parseAmount: parseAmount,
    newId: newId, load: load, store: store, toast: toast, catColor: catColor, field: field, chipRow: chipRow, curOptions: curOptions };
  R.f = { saveAll: saveAll, saveCfg: saveCfg, loadAll: loadAll, sortedAccounts: sortedAccounts, findAcct: findAcct, acctCur: acctCur, fullName: fullName,
    acctName: acctName, isExt: isExt, usesAcct: usesAcct, toAmt: toAmt, rateOf: rateOf, entryRate: entryRate, dispCur: dispCur, val: val,
    foreignCurs: foreignCurs, balances: balances, inFilter: inFilter, lacksRate: lacksRate, totals: totals, monthList: monthList, whoNames: whoNames,
    cardCycle: cardCycle, instSplit: instSplit, polAmt: polAmt, polSum: polSum, polCat: polCat, polDate: polDate, periodText: periodText,
    polInfo: polInfo, polLeft: polLeft, autoRecordPolicies: autoRecordPolicies, ensurePeople: ensurePeople, entryForm: entryForm, lastAcct: lastAcct,
    recordedMap: recordedMap };
})();
