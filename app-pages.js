/* 隨手記帳 — 頁面：明細、帳戶、保單與分期、統計、基本資料 */
(function () {
  'use strict';
  var R = window.R, D = R.D, UI = R.UI, cfg = R.cfg, C = R.C, f = R.f;
  var u = R.u, h = u.h, $ = u.$, fmt = u.fmt, sfmt = u.sfmt, toast = u.toast, pad = u.pad, ymd = u.ymd;
  var CATS = C.CATS, CURS = C.CURS, POL_FREQ = C.POL_FREQ;
  var WEEK = '日一二三四五六';

  var formHost = h('section', { class: 'panel' }, h('h2', {}, '記一筆'));
  var formBody = h('div', {});
  formHost.append(formBody);
  var formApi = null, formSig = '';
  var S = { statRange: 6, statSel: null, premBy: 'insured', premOpen: false, instOpen: false, remOpen: {} };

  function btn(text, cls, fn, extra) { return h('button', Object.assign({ type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), onclick: fn }, extra || {}), text); }
  function sec(title, extra) { return h('section', { class: 'card' }, title ? h('h3', {}, title) : null, extra); }
  function bar(pct, color) { return h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.max(1, Math.min(100, pct)) + '%;background:' + color })); }
  function monthNav(v) {
    var y = UI.ym.getFullYear(), m = UI.ym.getMonth() + 1;
    v.append(h('div', { class: 'month' },
      h('button', { 'aria-label': '上個月', onclick: function () { UI.ym = new Date(y, m - 2, 1); R.render(); } }, '‹'),
      h('span', {}, y + ' 年 ' + m + ' 月'),
      h('button', { 'aria-label': '下個月', onclick: function () { UI.ym = new Date(y, m, 1); R.render(); } }, '›')));
    return { y: y, m: m, key: y + '-' + pad(m) };
  }
  function tvalue(e) { return f.lacksRate(e) ? 0 : e.amount * f.entryRate(e); } // 折台幣（統計用，不受篩選影響）

  /* =============== 明細 =============== */
  function pageList(v) {
    var ym = monthNav(v), list = f.monthList(ym.y, ym.m), dc = f.dispCur(), t = f.totals(list), net = t.inc - t.exp;
    var label = UI.filterAcct ? '結餘（' + f.acctName(UI.filterAcct) + '）' : (f.foreignCurs().length ? '結餘（折台幣）' : '結餘');
    if (UI.filterWho !== null) label = '花在「' + (UI.filterWho === '__none' ? '未指定' : UI.filterWho) + '」';
    v.append(h('div', { class: 'summary' },
      h('div', {}, h('small', {}, '支出'), h('b', { class: 'exp' }, fmt(t.exp, dc))),
      h('div', {}, h('small', {}, '收入'), h('b', { class: 'inc' }, fmt(t.inc, dc))),
      h('div', {}, h('small', {}, label), h('b', { class: net < 0 && UI.filterWho === null ? 'exp' : '' }, UI.filterWho !== null ? fmt(t.exp, dc) : sfmt(net, dc)))));
    if (!UI.filterAcct && list.some(f.lacksRate)) v.append(h('p', { class: 'hint warn' }, '有外幣紀錄缺少匯率，這些金額未計入台幣合計。請到「基本資料」設定匯率。'));

    // 篩選
    var fb = h('div', { class: 'chips filt' });
    fb.append(h('button', { class: 'chip' + (!UI.filterAcct ? ' on' : ''), onclick: function () { UI.filterAcct = null; R.render(); } }, '全部帳戶'));
    f.sortedAccounts().forEach(function (a) {
      fb.append(h('button', { class: 'chip' + (UI.filterAcct === a.id ? ' on' : ''), onclick: function () { UI.filterAcct = a.id; R.render(); } }, f.fullName(a)));
    });
    v.append(fb);
    if (D.family.length) {
      var wb = h('div', { class: 'chips filt' });
      [{ v: null, t: '所有對象' }].concat(D.family.map(function (x) { return { v: x.name, t: x.name }; }), [{ v: '__none', t: '未指定' }]).forEach(function (it) {
        wb.append(h('button', { class: 'chip' + (UI.filterWho === it.v ? ' on' : ''), onclick: function () { UI.filterWho = it.v; R.render(); } }, it.t));
      });
      v.append(wb);
    }

    var nowD = new Date();
    if (ym.y === nowD.getFullYear() && ym.m === nowD.getMonth() + 1) { var rem = cardReminders(); if (rem) v.append(rem); }

    // 記一筆表單（保留同一個節點，不會因為重新整理而清掉輸入）
    var sig = JSON.stringify(D.accounts.map(function (a) { return [a.id, a.name, a.bank, a.cur]; })) + JSON.stringify(D.family.map(function (x) { return x.name; })) + JSON.stringify(D.rates);
    if (!formApi) formApi = f.entryForm(formBody, {}, { inline: true });
    else if (sig !== formSig) formApi.redraw();
    formSig = sig;
    v.append(formHost);

    var box = h('div', { class: 'list' }, h('h3', {}, '本月紀錄'));
    if (!list.length) box.append(h('p', { class: 'hint' }, '這個月還沒有紀錄。'));
    var lastDate = '';
    list.forEach(function (e) {
      if (e.date !== lastDate) {
        lastDate = e.date; var d = new Date(e.date + 'T00:00:00');
        box.append(h('div', { class: 'dayh' }, (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'));
      }
      var tr = e.type === 'transfer', cur = f.acctCur(tr ? e.from : e.acct);
      var sub = (tr ? f.acctName(e.from) + ' → ' + f.acctName(e.to) : f.acctName(e.acct)) + (e.who ? ' · ' + e.who : '') + (e.by ? ' · ' + e.by : '') + (e.note ? ' · ' + e.note : '');
      var amt = e.type === 'income' ? h('span', { class: 'inc' }, '+' + fmt(e.amount, cur)) : tr ? h('span', {}, fmt(e.amount, cur)) : h('span', { class: 'exp' }, '-' + fmt(e.amount, cur));
      var extra = '';
      if (!tr && cur !== 'TWD') extra = f.entryRate(e) > 0 ? '≈ ' + fmt(e.amount * f.entryRate(e), 'TWD') : '缺匯率';
      box.append(h('div', { class: 'item', onclick: function () { R.openEntry(e); } },
        h('div', { class: 'l' }, h('div', { class: 't' }, tr ? '轉帳' : (e.cat || '其他'), e.pol ? h('span', { class: 'tag' }, '定期') : null), h('div', { class: 's' }, sub)),
        h('div', { class: 'r' }, amt, h('small', { class: 'dot ' + (e.synced ? 'done' : 'pending') }, extra ? extra + ' · ' : '', e.synced ? '已同步' : '待同步'))));
    });
    v.append(box);
  }

  function cardReminders() {
    var cards = f.sortedAccounts().filter(function (a) { return a.kind === 'card' && a.closeDay > 0; });
    if (!cards.length) return null;
    var box = sec('信用卡提醒');
    cards.forEach(function (a) {
      var c = f.cardCycle(a), cur = a.cur;
      var lines = ['下次結帳 ' + u.mdt(c.next) + (c.days === 0 ? '（今天）' : '（' + c.days + ' 天後）') + '，本期已刷 ' + fmt(c.sum, cur)];
      if (c.due) lines.push('繳款截止 ' + u.mdt(c.due) + (c.dueDays === 0 ? '（今天）' : c.dueDays < 0 ? '（已過）' : '（' + c.dueDays + ' 天後）') + '，上期帳單約 ' + fmt(c.billed, cur));
      var pay = a.payAcct && f.findAcct(a.payAcct) ? a.payAcct : null;
      box.append(h('div', { class: 'rem' }, h('b', {}, f.fullName(a)), lines.map(function (l) { return h('div', { class: 's' }, l); }),
        h('div', { class: 's' }, (a.auto ? '自動扣款' : '需手動轉帳繳款') + (pay ? '，帳戶：' + f.acctName(pay) : '')),
        c.billed > 0 ? btn(a.auto ? '記錄已扣款' : '轉帳繳款', '', function () { R.openEntry(null, { type: 'transfer', acct: pay || f.lastAcct(), to: a.id, amount: c.billed, date: u.today() }); }) : null));
    });
    return box;
  }

  /* =============== 帳戶 =============== */
  function pageAcct(v) {
    var list = f.sortedAccounts(), bal = f.balances();
    v.append(h('div', { class: 'btnrow' }, btn('新增帳戶', 'primary', function () { openAcct(null); }),
      btn('轉帳 / 換匯', '', function () { R.openEntry(null, { type: 'transfer' }); }, list.length < 2 ? { disabled: true } : {})));
    var rem = cardReminders(); if (rem) v.append(rem);
    if (!list.length) { v.append(h('p', { class: 'hint' }, '還沒有帳戶。按「新增帳戶」建立現金、銀行或信用卡。')); return; }
    var net = 0, miss = false;
    list.forEach(function (a) { var r = f.rateOf(a.cur); if (r > 0) net += (bal[a.id] || 0) * r; else miss = true; });
    v.append(h('div', { class: 'summary one' }, h('div', {}, h('small', {}, '淨資產（折合台幣）'), h('b', { class: net < 0 ? 'exp' : '' }, sfmt(net, 'TWD')))));
    if (miss) v.append(h('p', { class: 'hint warn' }, '有外幣帳戶還沒設定匯率，未計入淨資產。請到「基本資料」設定。'));
    [['', '一般帳戶'], ['card', '信用卡'], ['invest', '投資帳戶']].forEach(function (g) {
      var items = list.filter(function (a) { return (a.kind || '') === g[0]; });
      if (!items.length) return;
      var box = sec(g[1]);
      items.forEach(function (a) {
        box.append(h('div', { class: 'item', onclick: function () { openAcct(a); } },
          h('div', { class: 'l' }, h('div', { class: 't' }, f.fullName(a)), h('div', { class: 's' }, a.cur + (a.kind === 'card' && a.closeDay ? ' · 結帳日 ' + a.closeDay + ' 號' : '') + (a.kind === 'card' && a.dueDay ? ' · 繳款日 ' + a.dueDay + ' 號' : ''))),
          h('div', { class: 'r' }, h('span', { class: (bal[a.id] || 0) < 0 ? 'exp' : '' }, sfmt(bal[a.id] || 0, a.cur)),
            h('small', {}, h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); ev.stopPropagation(); UI.filterAcct = a.id; UI.tab = 'list'; R.render(); } }, '看明細')))));
      });
      v.append(box);
    });
  }

  function openAcct(a) {
    var dr = a ? Object.assign({}, a) : { id: null, name: '', bank: '', cur: 'TWD', opening: 0, kind: '', closeDay: 0, dueDay: 0, auto: false, payAcct: '' };
    R.openDlg(a ? '修改帳戶' : '新增帳戶', function (b) {
      var name = h('input', { type: 'text', value: dr.name, placeholder: '例如：薪轉戶、現金、聯邦卡' });
      var bank = h('input', { type: 'text', value: dr.bank || '', placeholder: '選填，例如：國泰世華' });
      var cur = h('select', {}, u.curOptions(dr.cur));
      var kind = h('select', {}, [['', '一般帳戶'], ['card', '信用卡'], ['invest', '投資帳戶']].map(function (k) { return h('option', { value: k[0], selected: k[0] === (dr.kind || '') }, k[1]); }));
      var opening = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: dr.opening || 0 });
      var cardBox = h('div', {});
      var close = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 31, value: dr.closeDay || '', placeholder: '例如 15' });
      var due = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 31, value: dr.dueDay || '', placeholder: '例如 2' });
      var auto = h('input', { type: 'checkbox', checked: !!dr.auto });
      var payAcct = h('select', {}, h('option', { value: '' }, '（不指定）'),
        f.sortedAccounts().filter(function (x) { return x.kind !== 'card' && x.id !== dr.id; }).map(function (x) { return h('option', { value: x.id, selected: x.id === dr.payAcct }, f.fullName(x)); }));
      cardBox.append(u.field('結帳日（每月幾號）', close), u.field('繳款截止日（每月幾號）', due),
        h('label', { class: 'chk' }, auto, '銀行自動扣款（不用手動轉帳）'), u.field('扣款／繳款帳戶', payAcct));
      var err = h('p', { class: 'err' });
      function sync() { cardBox.style.display = kind.value === 'card' ? '' : 'none'; }
      kind.onchange = sync; sync();
      b.append(u.field('帳戶名稱', name), u.field('銀行', bank), u.field('幣別', cur), u.field('類型', kind),
        u.field('期初餘額（信用卡欠款請填負數）', opening, '記帳會從這個金額開始增減。'), cardBox, err,
        h('div', { class: 'btns' }, btn('取消', '', R.closeDlg), btn('儲存', 'primary', function () {
          var nm = name.value.trim(); if (!nm) { err.textContent = '請輸入帳戶名稱。'; return; }
          var op = parseFloat(opening.value || 0); if (!isFinite(op)) { err.textContent = '期初餘額請輸入數字。'; return; }
          var cd = parseInt(close.value, 10) || 0, dd = parseInt(due.value, 10) || 0;
          if (kind.value === 'card' && ((cd && (cd < 1 || cd > 31)) || (dd && (dd < 1 || dd > 31)))) { err.textContent = '日期請填 1 到 31。'; return; }
          var o = { id: dr.id || u.newId('a_'), ts: dr.ts || Date.now(), name: nm, bank: bank.value.trim(), cur: cur.value, opening: u.roundCur(op, cur.value) };
          if (kind.value) o.kind = kind.value;
          if (kind.value === 'card') { o.closeDay = cd; o.dueDay = dd; o.auto = auto.checked; o.payAcct = payAcct.value; }
          if (a) D.accounts = D.accounts.map(function (x) { return x.id === o.id ? o : x; }); else D.accounts.push(o);
          f.saveAll(); R.closeDlg(); R.render(); toast('已儲存');
        })));
      if (a) {
        var armed = false, delb = btn('刪除帳戶', 'danger', function () {
          var n = f.usesAcct(a.id);
          if (n) { err.textContent = '這個帳戶已有 ' + n + ' 筆紀錄或保單使用，不能刪除。可改名，或先刪掉相關紀錄。'; return; }
          if (!armed) { armed = true; delb.textContent = '再按一次確認刪除'; return; }
          D.accounts = D.accounts.filter(function (x) { return x.id !== a.id; });
          f.saveAll(); R.closeDlg(); R.render(); toast('已刪除');
        });
        b.append(delb);
      }
    });
  }

  /* =============== 保單與分期 =============== */
  function polRecord(p, k, date) {
    var had = D.entries.filter(function (x) { return x.pol === p.id && x.period === k; })[0];
    if (had) { toast('這一期已經記錄過了（' + had.date + '）'); return; }
    R.openEntry(null, { type: 'expense', cat: f.polCat(p), pol: p.id, who: p.insured || '', acct: p.acct, period: k, amount: f.polAmt(p, k), date: ymd(date), note: p.name + ' ' + f.periodText(p, k) });
  }
  function annual(p) { return p.amount * 12 / p.freq; }
  function pagePlan(v) {
    v.append(h('div', { class: 'btnrow' }, btn('新增保單', 'primary', function () { openPol(null); }), btn('新增分期', '', function () { openPol(null, 'inst'); }), btn('檢查重複', '', openDup)));
    if (!D.policies.length) { v.append(h('p', { class: 'hint' }, '還沒有保單或分期。保單可設定每期扣款日與金額，到期會自動記一筆支出；信用卡分期請選「新增分期」。')); return; }

    // 即將到期
    var items = [];
    D.policies.forEach(function (p) {
      var i = f.polInfo(p);
      if (i.missed) items.push({ p: p, k: i.missed.k, date: i.missed.date, days: i.missed.days, missed: true });
      if (!i.finished && !i.done && i.days <= 30) items.push({ p: p, k: i.k, date: i.date, days: i.days });
    });
    items.sort(function (a, b) { return a.days - b.days; });
    if (items.length) {
      var rb = sec('30 天內要扣款 / 漏記');
      items.forEach(function (x) {
        rb.append(h('div', { class: 'rem' }, h('b', {}, x.p.name), x.p.insured ? h('span', { class: 'tag' }, x.p.insured) : null,
          h('div', { class: 's' }, u.mdt(x.date) + (x.missed ? '（已過 ' + (-x.days) + ' 天，尚未記錄）' : x.days === 0 ? '（今天）' : '（' + x.days + ' 天後）') + ' · ' + f.periodText(x.p, x.k) + ' · ' + fmt(f.polAmt(x.p, x.k), f.acctCur(x.p.acct)) + ' · ' + f.acctName(x.p.acct)),
          btn('記錄這一期', '', function () { polRecord(x.p, x.k, x.date); })));
      });
      v.append(rb);
    }

    // 年繳保費
    var ins = D.policies.filter(function (p) { return p.kind !== 'inst' && !f.polInfo(p).finished; });
    if (ins.length) {
      var pc = sec('');
      var tot = 0; ins.forEach(function (p) { tot += annual(p) * (f.rateOf(f.acctCur(p.acct)) || 0); });
      pc.append(h('button', { class: 'fold', onclick: function () { S.premOpen = !S.premOpen; R.render(); } }, h('b', {}, '保費年繳總覽　'), h('span', {}, fmt(tot, 'TWD') + ' / 年'), h('span', { class: 'arrow' }, S.premOpen ? '▲' : '▼')));
      if (S.premOpen) {
        pc.append(h('div', { class: 'chips' }, [['insured', '依被保人'], ['holder', '依要保人']].map(function (o) {
          return h('button', { class: 'chip' + (S.premBy === o[0] ? ' on' : ''), onclick: function () { S.premBy = o[0]; R.render(); } }, o[1]);
        })));
        var groups = {};
        ins.forEach(function (p) { var k = p[S.premBy] || '未填'; (groups[k] = groups[k] || []).push(p); });
        Object.keys(groups).forEach(function (who) {
          var rows = groups[who], sum = rows.reduce(function (t, p) { return t + annual(p) * (f.rateOf(f.acctCur(p.acct)) || 0); }, 0);
          pc.append(h('div', { class: 'dayh' }, who + '　' + fmt(sum, 'TWD') + ' / 年'));
          rows.forEach(function (p) {
            pc.append(h('div', { class: 'item', onclick: function () { openPol(p); } }, h('div', { class: 'l' }, h('div', { class: 't' }, p.name), h('div', { class: 's' }, (p.insurer || '') + ' · ' + POL_FREQ[p.freq] + ' ' + fmt(p.amount, f.acctCur(p.acct)))),
              h('div', { class: 'r' }, fmt(annual(p), f.acctCur(p.acct)) + ' / 年')));
          });
        });
      }
      v.append(pc);
    }

    // 分期總覽
    var insts = D.policies.filter(function (p) { return p.kind === 'inst'; }).map(function (p) { return { p: p, left: f.polLeft(p), info: f.polInfo(p) }; }).filter(function (x) { return x.left.n > 0; });
    if (insts.length) {
      var totalLeft = insts.reduce(function (t, x) { return t + x.left.sum * (f.rateOf(f.acctCur(x.p.acct)) || 0); }, 0);
      var ic = sec('');
      ic.append(h('button', { class: 'fold', onclick: function () { S.instOpen = !S.instOpen; R.render(); } }, h('b', {}, '分期剩餘　'), h('span', {}, fmt(totalLeft, 'TWD')), h('span', { class: 'arrow' }, S.instOpen ? '▲' : '▼')));
      if (S.instOpen) insts.forEach(function (x) {
        ic.append(h('div', { class: 'item', onclick: function () { openPol(x.p); } }, h('div', { class: 'l' }, h('div', { class: 't' }, x.p.name), h('div', { class: 's' }, f.acctName(x.p.acct) + ' · 剩 ' + x.left.n + ' 期')),
          h('div', { class: 'r' }, fmt(x.left.sum, f.acctCur(x.p.acct)))));
      });
      v.append(ic);
    }

    // 清單
    var lb = sec('全部保單與分期');
    D.policies.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }).forEach(function (p) {
      var i = f.polInfo(p), cur = f.acctCur(p.acct), left = p.total > 0 ? f.polLeft(p) : null;
      var st = i.finished ? '已結束' : '下次 ' + u.mdt(i.date) + (i.done ? '（已記錄）' : '');
      lb.append(h('div', { class: 'item', onclick: function () { openPol(p); } },
        h('div', { class: 'l' }, h('div', { class: 't' }, p.name, h('span', { class: 'tag' }, p.kind === 'inst' ? '分期' : '保單')),
          h('div', { class: 's' }, (p.insured ? p.insured + ' · ' : '') + (p.kind === 'inst' ? '每月' : POL_FREQ[p.freq]) + ' · ' + f.acctName(p.acct) + ' · ' + st + (left ? ' · 剩 ' + left.n + ' 期' : ''))),
        h('div', { class: 'r' }, fmt(p.amount, cur), p.firstAmt > 0 ? h('small', {}, '首期 ' + fmt(p.firstAmt, cur)) : null)));
    });
    v.append(lb);
  }

  function openPol(p, newKind) {
    var inst = p ? p.kind === 'inst' : newKind === 'inst';
    var firstAcct = f.sortedAccounts().filter(function (a) { return inst ? a.kind === 'card' : true; })[0];
    var dr = p ? Object.assign({}, p) : { id: null, kind: inst ? 'inst' : 'life', acct: inst ? (firstAcct ? firstAcct.id : '') : f.lastAcct(), freq: inst ? 1 : 12 };
    var extMode = p && f.isExt(p.acct);
    R.openDlg((p ? '修改' : '新增') + (inst ? '信用卡分期' : '保單 / 定期扣款'), function (b) {
      var name = h('input', { type: 'text', value: dr.name || '', placeholder: inst ? '例如：iPhone 分期' : '例如：終身壽險' });
      var dlId = 'pplist' + Date.now();
      var dl = h('datalist', { id: dlId }, D.family.map(function (x) { return h('option', { value: x.name }); }));
      var holder = h('input', { type: 'text', value: dr.holder || '', list: dlId, placeholder: '選填' });
      var insured = h('input', { type: 'text', value: dr.insured || '', list: dlId, placeholder: inst ? '這筆分期是誰的（選填）' : '選填，統計會用到' });
      var insurer = h('input', { type: 'text', value: dr.insurer || '', placeholder: '例如：國泰人壽' });
      var accItems = f.sortedAccounts().filter(function (a) { return !inst || a.kind === 'card'; }).map(function (a) { return { v: a.id, t: f.fullName(a) }; });
      var accBox = h('div', {});
      var ext = h('input', { type: 'text', placeholder: '其他帳戶名稱', value: extMode ? String(dr.acct).slice(2) : '' });
      function drawAcc() {
        accBox.innerHTML = '';
        var items = accItems.slice(); if (!inst) items.push({ v: '__ext', t: '其他帳戶（未納入管理）' });
        accBox.append(u.chipRow(items, extMode ? '__ext' : dr.acct, function (x) { if (x === '__ext') { extMode = true; } else { extMode = false; dr.acct = x; } drawAcc(); }));
        if (extMode) accBox.append(ext);
        if (inst && !accItems.length) accBox.append(h('p', { class: 'hint warn' }, '還沒有信用卡，請先到「帳戶」新增一張信用卡。'));
      }
      drawAcc();
      var freq = h('select', {}, Object.keys(POL_FREQ).map(function (k) { return h('option', { value: k, selected: +k === +dr.freq }, POL_FREQ[k]); }));
      var amount = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: dr.amount || '', placeholder: '0' });
      var firstAmt = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: dr.firstAmt > 0 ? dr.firstAmt : '', placeholder: '尾數不同時填，否則留空' });
      var first = h('input', { type: 'date', value: dr.first || '' });
      var start = h('input', { type: 'date', value: dr.start || '' });
      var payYears = h('input', { type: 'number', inputmode: 'numeric', value: dr.payYears > 0 ? dr.payYears : '', placeholder: '例如 20' });
      var term = h('input', { type: 'text', value: dr.term || '', placeholder: '例如：終身、到 65 歲' });
      var total = h('input', { type: 'number', inputmode: 'numeric', value: dr.total > 0 && !(dr.payYears > 0) ? dr.total : '', placeholder: inst ? '例如 12' : '沒有固定期數就留空' });
      var autoRec = h('input', { type: 'checkbox', checked: dr.autoRec !== false });
      var err = h('p', { class: 'err' });

      b.append(u.field('名稱', name));
      if (!inst) b.append(u.field('要保人', holder), u.field('被保人', insured), u.field('保險公司', insurer));
      else b.append(u.field('分期對象', insured));
      b.append(dl, h('label', {}, inst ? '分期的信用卡' : '扣款帳戶'), accBox);
      if (!inst) b.append(u.field('繳費頻率', freq));
      b.append(u.field(inst ? '每期金額' : '每期保費', amount));
      if (inst) b.append(u.field('第一期金額（選填）', firstAmt, '總額除不盡時，尾數通常放在第一期。'));
      b.append(u.field(inst ? '第一期扣款日' : '第一期扣款日（或填投保始期）', first));
      if (!inst) b.append(u.field('投保始期', start), u.field('繳費年期（年）', payYears, '填了會自動算出總期數。'), u.field('保障期間', term));
      b.append(u.field(inst ? '分期期數' : '總期數', total), h('label', { class: 'chk' }, autoRec, '到期自動記一筆支出'), err,
        h('div', { class: 'btns' }, btn('取消', '', R.closeDlg), btn('儲存', 'primary', function () {
          var nm = name.value.trim(); if (!nm) { err.textContent = '請輸入名稱。'; return; }
          var acct = extMode ? 'x:' + ext.value.trim() : dr.acct;
          if (extMode && !ext.value.trim()) { err.textContent = '請輸入其他帳戶的名稱。'; return; }
          if (!acct) { err.textContent = inst ? '分期請選擇一張信用卡。' : '請選擇扣款帳戶。'; return; }
          var cur = f.acctCur(acct), am = u.roundCur(u.parseAmount(amount.value), cur);
          if (!isFinite(am) || am <= 0) { err.textContent = '請輸入大於 0 的金額。'; return; }
          var fa = 0;
          if (inst && firstAmt.value.trim() !== '') { fa = u.roundCur(u.parseAmount(firstAmt.value), cur); if (!isFinite(fa) || fa <= 0) { err.textContent = '第一期金額請填大於 0 的數字，或留空。'; return; } if (fa === am) fa = 0; }
          var st = inst ? '' : start.value, fs = first.value || st;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fs)) { err.textContent = '請選擇第一期扣款日。'; return; }
          var fq = inst ? 1 : parseInt(freq.value, 10), py = 0;
          if (!inst && payYears.value.trim() !== '') { py = parseInt(payYears.value, 10); if (!(py >= 1 && py <= 100)) { err.textContent = '繳費年期請填 1 到 100 的整數。'; return; } }
          var tt = 0;
          if (inst && total.value.trim() === '') { err.textContent = '請輸入分期期數。'; return; }
          if (py > 0) tt = Math.max(1, Math.round(py * 12 / fq));
          else if (total.value.trim() !== '') { tt = parseInt(total.value, 10); if (!(tt >= 1 && tt <= 1200)) { err.textContent = '總期數請填 1 到 1200 的整數。'; return; } }
          var np = { id: dr.id || u.newId('p_'), ts: dr.ts || Date.now(), name: nm, kind: dr.kind, acct: acct, freq: fq, amount: am, first: fs, total: tt,
            holder: inst ? '' : holder.value.trim(), insured: insured.value.trim(), autoRec: autoRec.checked, autoK: -1, firstAmt: fa,
            insurer: inst ? '' : insurer.value.trim(), start: st, payYears: py, term: inst ? '' : term.value.trim() };
          if (dr.since) np.since = dr.since;
          if (dr.skip) np.skip = dr.skip;
          if (p && p.first === fs && +p.freq === fq && p.autoK >= 0) np.autoK = p.autoK;
          var fixed = 0;
          if (p) D.policies = D.policies.map(function (x) { return x.id === np.id ? np : x; }); else D.policies.push(np);
          if (inst && p) D.entries.forEach(function (e) { if (e.pol === np.id && e.amount !== f.polAmt(np, e.period)) { e.amount = f.polAmt(np, e.period); e.synced = false; fixed++; } });
          f.ensurePeople([np.holder, np.insured]);
          f.autoRecordPolicies(); f.saveAll(); R.closeDlg(); R.render(); R.sync(true);
          toast(fixed ? '已儲存，並更正 ' + fixed + ' 筆已記錄的分期金額' : '已儲存');
        })));
      if (p) {
        var armed = false, delb = btn('刪除', 'danger', function () {
          if (!armed) { armed = true; delb.textContent = '再按一次確認刪除（已記錄的支出會保留）'; return; }
          D.policies = D.policies.filter(function (x) { return x.id !== p.id; });
          f.saveAll(); R.closeDlg(); R.render(); toast('已刪除');
        });
        b.append(delb);
      }
    });
  }
  R.openPol = openPol;

  function openDup() {
    var groups = {};
    D.entries.forEach(function (e) { if (e.type === 'expense') (groups[e.acct + '|' + e.date + '|' + e.amount] = groups[e.acct + '|' + e.date + '|' + e.amount] || []).push(e); });
    var dups = Object.keys(groups).filter(function (k) { return groups[k].length > 1; }).sort().reverse();
    R.openDlg('檢查重複記錄', function (b) {
      if (!dups.length) b.append(h('p', { class: 'hint' }, '沒有發現「同帳戶、同日期、同金額」的重複支出。'));
      else b.append(h('p', { class: 'hint' }, '以下支出的帳戶、日期、金額都相同，若是誤記重複，可按「刪除」。'));
      dups.forEach(function (k) {
        var box = sec('');
        groups[k].forEach(function (e) {
          box.append(h('div', { class: 'item' }, h('div', { class: 'l' }, h('div', { class: 't' }, e.cat || '其他', ' ', fmt(e.amount, f.acctCur(e.acct))), h('div', { class: 's' }, e.date + ' · ' + f.acctName(e.acct) + (e.note ? ' · ' + e.note : ''))),
            btn('刪除', 'danger sm', function () {
              if (!confirm('刪除這一筆？')) return;
              D.entries = D.entries.filter(function (x) { return x.id !== e.id; }); f.saveAll(); R.render(); openDup();
            })));
        });
        b.append(box);
      });
      b.append(h('div', { class: 'btns' }, btn('關閉', '', R.closeDlg)));
    });
  }

  /* =============== 統計 =============== */
  function pageStat(v) {
    var ym = monthNav(v);
    var monthExp = D.entries.filter(function (e) { return e.type === 'expense' && typeof e.date === 'string' && e.date.slice(0, 7) === ym.key && isFinite(e.amount); });
    var inc = 0, exp = 0, miss = false;
    D.entries.forEach(function (e) {
      if (e.type === 'transfer' || e.date.slice(0, 7) !== ym.key || !isFinite(e.amount)) return;
      if (f.lacksRate(e)) { miss = true; return; }
      if (e.type === 'income') inc += tvalue(e); else exp += tvalue(e);
    });
    v.append(h('div', { class: 'summary' },
      h('div', {}, h('small', {}, '支出'), h('b', { class: 'exp' }, fmt(exp, 'TWD'))), h('div', {}, h('small', {}, '收入'), h('b', { class: 'inc' }, fmt(inc, 'TWD'))),
      h('div', {}, h('small', {}, '結餘'), h('b', { class: inc - exp < 0 ? 'exp' : '' }, sfmt(inc - exp, 'TWD')))));
    if (miss) v.append(h('p', { class: 'hint warn' }, '有外幣紀錄缺少匯率，未計入統計。'));

    function breakdown(title, keyFn, colorFn, idPrefix) {
      var by = {}, total = 0;
      monthExp.forEach(function (e) { var k = keyFn(e); if (k == null) return; var x = tvalue(e); by[k] = (by[k] || 0) + x; total += x; });
      var keys = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      var box = sec(title);
      if (!keys.length) { box.append(h('p', { class: 'hint' }, '這個月沒有資料。')); return box; }
      keys.forEach(function (k, i) {
        var id = idPrefix + '|' + k, open = S.statSel === id, pct = total ? by[k] / total * 100 : 0;
        box.append(h('button', { class: 'catrow', onclick: function () { S.statSel = open ? null : id; R.render(); } },
          h('div', { class: 'cr1' }, h('span', {}, h('i', { class: 'sw', style: 'background:' + colorFn(k, i) }), k), h('span', {}, fmt(by[k], 'TWD') + '　' + pct.toFixed(0) + '%')), bar(pct, colorFn(k, i))));
        if (open) monthExp.filter(function (e) { return keyFn(e) === k; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) {
          box.append(h('div', { class: 'sub', onclick: function () { R.openEntry(e); } }, h('span', {}, e.date.slice(5) + ' ' + (e.note || e.cat || '')), h('span', {}, fmt(e.amount, f.acctCur(e.acct)))));
        });
      });
      return box;
    }
    v.append(breakdown('支出分類', function (e) { return e.cat || '其他'; }, function (k) { return u.catColor('expense', k); }, 'cat'));
    if (D.family.length || monthExp.some(function (e) { return e.who; })) {
      var pal = ['#6fb4f0', '#f0a63f', '#c79cf0', '#6fd3a4', '#f06fa8', '#4fd3d3'];
      v.append(breakdown('花在誰身上', function (e) { return e.who || '未指定'; }, function (k, i) { return pal[i % pal.length]; }, 'who'));
    }
    var polOf = function (e) { return e.pol ? D.policies.filter(function (p) { return p.id === e.pol; })[0] : null; };
    if (monthExp.some(function (e) { var p = polOf(e); return p && p.kind !== 'inst'; })) {
      var pal2 = ['#f0836f', '#6fb4f0', '#f0a63f', '#6fd3a4', '#c79cf0'];
      v.append(breakdown('保費（依保險公司）', function (e) { var p = polOf(e); return p && p.kind !== 'inst' ? (p.insurer || '未填保險公司') : null; }, function (k, i) { return pal2[i % pal2.length]; }, 'ins'));
    }

    // 近 6 個月收支
    var months = [];
    for (var i = 5; i >= 0; i--) { var d = new Date(UI.ym.getFullYear(), UI.ym.getMonth() - i, 1); months.push(d.getFullYear() + '-' + pad(d.getMonth() + 1)); }
    var data = months.map(function (k) {
      var r = { key: k, inc: 0, exp: 0 };
      D.entries.forEach(function (e) { if (e.type === 'transfer' || e.date.slice(0, 7) !== k || !isFinite(e.amount)) return; if (e.type === 'income') r.inc += tvalue(e); else r.exp += tvalue(e); });
      return r;
    });
    var mx = Math.max.apply(null, data.map(function (x) { return Math.max(x.inc, x.exp); }).concat([1]));
    var tb = sec('近 6 個月收支');
    data.forEach(function (x) {
      tb.append(h('div', { class: 'trend' }, h('div', { class: 'tl' }, x.key.slice(2).replace('-', '/')),
        h('div', { class: 'tb' }, bar(x.inc / mx * 100, '#5cc9a7'), bar(x.exp / mx * 100, '#e5655b')), h('div', { class: 'tn' }, h('span', { class: 'inc' }, fmt(x.inc, 'TWD')), h('span', { class: 'exp' }, fmt(x.exp, 'TWD')))));
    });
    v.append(tb);

    // 分類分佈（6／12 個月）
    var n = S.statRange, mlist = [];
    for (var j = n - 1; j >= 0; j--) { var dd = new Date(UI.ym.getFullYear(), UI.ym.getMonth() - j, 1); mlist.push(dd.getFullYear() + '-' + pad(dd.getMonth() + 1)); }
    var catSet = {}, mdata = mlist.map(function (k) {
      var r = { key: k, tot: 0, byc: {} };
      D.entries.forEach(function (e) { if (e.type !== 'expense' || e.date.slice(0, 7) !== k || !isFinite(e.amount)) return; var c = e.cat || '其他', x = tvalue(e); r.byc[c] = (r.byc[c] || 0) + x; r.tot += x; catSet[c] = true; });
      return r;
    });
    var mmax = Math.max.apply(null, mdata.map(function (x) { return x.tot; }).concat([1]));
    var catList = CATS.expense.filter(function (c) { return catSet[c]; }).concat(Object.keys(catSet).filter(function (c) { return CATS.expense.indexOf(c) < 0; }));
    var db = sec('每月支出分類');
    db.append(h('div', { class: 'chips' }, [6, 12].map(function (k) { return h('button', { class: 'chip' + (S.statRange === k ? ' on' : ''), onclick: function () { S.statRange = k; R.render(); } }, '近 ' + k + ' 個月'); })));
    if (!catList.length) db.append(h('p', { class: 'hint' }, '這段期間沒有支出。'));
    else {
      db.append(h('div', { class: 'legend' }, catList.map(function (c) { return h('span', {}, h('i', { class: 'sw', style: 'background:' + u.catColor('expense', c) }), c); })));
      mdata.slice().reverse().forEach(function (x) {
        var stack = h('div', { class: 'stack', style: 'width:' + (x.tot / mmax * 100) + '%' });
        catList.forEach(function (c) { if (x.byc[c] > 0) stack.append(h('i', { style: 'flex:' + x.byc[c] + ';background:' + u.catColor('expense', c) })); });
        db.append(h('div', { class: 'trend' }, h('div', { class: 'tl' }, x.key.slice(2).replace('-', '/')), h('div', { class: 'tb' }, h('div', { class: 'bar' }, stack)), h('div', { class: 'tn' }, h('span', {}, fmt(x.tot, 'TWD')))));
      });
    }
    v.append(db);

    v.append(h('div', { class: 'btnrow' }, btn('匯出本月 CSV', '', function () {
      var rows = [['日期', '類型', '分類', '帳戶', '轉入帳戶', '金額', '幣別', '對象', '記帳人', '備註']];
      D.entries.filter(function (e) { return e.date.slice(0, 7) === ym.key; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
        var tr = e.type === 'transfer';
        rows.push([e.date, e.type === 'income' ? '收入' : tr ? '轉帳' : '支出', tr ? '' : e.cat || '', f.acctName(tr ? e.from : e.acct), tr ? f.acctName(e.to) : '', e.amount, f.acctCur(tr ? e.from : e.acct), e.who || '', e.by || '', e.note || '']);
      });
      var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
      R.download('記帳-' + ym.key + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    })));
  }

  /* =============== 基本資料 =============== */
  function pageInfo(v) {
    // 記帳人與同步
    var who = h('input', { type: 'text', maxlength: 20, value: cfg.who || '', placeholder: '例如：小明', autocomplete: 'off' });
    var url = h('input', { type: 'url', value: cfg.url || '', placeholder: 'https://script.google.com/macros/s/.../exec' });
    var token = h('input', { type: 'text', value: cfg.token || '', placeholder: '自訂一串文字', autocomplete: 'off' });
    var sb = sec('記帳人與同步');
    sb.append(u.field('記帳人名稱', who, '每筆紀錄都會帶上這個名字，同步到試算表的「記帳人」欄。'), u.field('Apps Script 網址', url), u.field('同步密語', token, '網址與密語只存在這支手機的瀏覽器裡，不會上傳到 GitHub。'),
      h('div', { class: 'btnrow' }, btn('儲存設定', 'primary', function () {
        cfg.who = who.value.trim(); cfg.url = url.value.trim(); cfg.token = token.value.trim(); f.saveCfg(); R.render(); toast('設定已儲存'); R.sync(true);
      }), btn('立即同步', '', function () { cfg.who = who.value.trim(); cfg.url = url.value.trim(); cfg.token = token.value.trim(); f.saveCfg(); R.sync(false); })));
    v.append(sb);

    // 家人
    var fb = sec('家人名單');
    fb.append(h('p', { class: 'hint' }, '記帳時可以選「花在誰身上」，保單也可以填要保人、被保人。'));
    D.family.forEach(function (m) {
      fb.append(h('div', { class: 'item', onclick: function () { openFam(m); } }, h('div', { class: 'l' }, h('div', { class: 't' }, m.name), h('div', { class: 's' }, [m.rel, m.birth, m.note].filter(Boolean).join(' · ') || '點一下編輯')), h('div', { class: 'r' }, '›')));
    });
    fb.append(btn('新增家人', 'primary', function () { openFam(null); }));
    v.append(fb);

    // 匯率
    var curs = f.foreignCurs(), rb = sec('匯率（1 外幣 ＝ ? 台幣）');
    if (!curs.length) rb.append(h('p', { class: 'hint' }, '目前沒有外幣帳戶。到「帳戶」新增外幣帳戶後，這裡會出現對應的匯率欄位。'));
    else {
      var ins = {};
      curs.forEach(function (c) { ins[c] = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: D.rates[c] || '', placeholder: '例如 ' + (c === 'JPY' ? '0.21' : c === 'USD' ? '32' : '1') }); rb.append(u.field(c + ' ' + CURS[c].name, ins[c])); });
      rb.append(btn('儲存匯率', 'primary', function () {
        var nr = {}; curs.forEach(function (c) { var x = parseFloat(ins[c].value); if (x > 0) nr[c] = x; });
        D.rates = nr; f.saveAll(); R.render(); toast('匯率已儲存'); R.sync(true);
      }));
    }
    v.append(rb);

    // 備份
    var bb = sec('資料備份');
    bb.append(h('p', { class: 'hint' }, '資料存在這支手機的瀏覽器裡。換手機或清除瀏覽資料前，請先匯出備份；試算表也會保留每一筆紀錄。'));
    var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
      var fl = this.files[0]; if (!fl) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var o = JSON.parse(rd.result); if (!o || !Array.isArray(o.e)) throw 0;
          if (!confirm('匯入會取代目前這支手機上的所有資料，確定嗎？')) return;
          u.store('rec.v3', o); location.reload();
        } catch (x) { toast('這不是有效的備份檔'); }
      };
      rd.readAsText(fl);
    } });
    bb.append(h('div', { class: 'btnrow' },
      btn('匯出備份', '', function () { R.download('隨手記帳備份-' + u.today() + '.json', JSON.stringify({ e: D.entries, a: D.accounts, p: D.policies, f: D.family, r: D.rates }), 'application/json'); }),
      btn('匯入備份', '', function () { file.click(); })), file,
      h('div', { class: 'btnrow' }, btn('全部重新同步到試算表', '', function () {
        if (!confirm('把所有紀錄重新送一次到試算表？（相同 ID 的列會被更新，不會重複）')) return;
        D.entries.forEach(function (e) { e.synced = false; }); u.store('rec.snap', ''); f.saveAll(); R.render(); R.sync(false);
      })));
    v.append(bb);
    v.append(h('p', { class: 'hint center' }, '隨手記帳 · 版本 3'));
  }

  function openFam(m) {
    R.openDlg(m ? '修改家人' : '新增家人', function (b) {
      var name = h('input', { type: 'text', value: m ? m.name : '', placeholder: '姓名' });
      var rel = h('input', { type: 'text', value: m && m.rel || '', placeholder: '例如：配偶、兒子' });
      var birth = h('input', { type: 'date', value: m && m.birth || '' });
      var note = h('input', { type: 'text', value: m && m.note || '', placeholder: '選填' });
      var err = h('p', { class: 'err' });
      b.append(u.field('姓名', name), u.field('關係', rel), u.field('生日', birth), u.field('備註', note), err,
        h('div', { class: 'btns' }, btn('取消', '', R.closeDlg), btn('儲存', 'primary', function () {
          var nm = name.value.trim(); if (!nm) { err.textContent = '請輸入姓名。'; return; }
          if (D.family.some(function (x) { return (!m || x.id !== m.id) && x.name === nm; })) { err.textContent = '已經有同名的家人。'; return; }
          var o = { id: m ? m.id : u.newId('f_'), ts: m ? m.ts : Date.now(), name: nm };
          if (rel.value.trim()) o.rel = rel.value.trim(); if (birth.value) o.birth = birth.value; if (note.value.trim()) o.note = note.value.trim();
          var n = 0;
          if (m) {
            D.family = D.family.map(function (x) { return x.id === m.id ? o : x; });
            if (m.name !== nm) {
              D.policies.forEach(function (p) { var hit = false; if (p.holder === m.name) { p.holder = nm; hit = true; } if (p.insured === m.name) { p.insured = nm; hit = true; } if (hit) n++; });
              D.entries.forEach(function (e) { if (e.who === m.name) { e.who = nm; e.synced = false; } });
              if (UI.filterWho === m.name) UI.filterWho = nm;
            }
          } else D.family.push(o);
          f.saveAll(); R.closeDlg(); R.render(); toast(n ? '已改名，' + n + ' 張保單同步更新' : '已儲存'); R.sync(true);
        })));
      if (m) {
        var armed = false, delb = btn('刪除', 'danger', function () {
          if (!armed) { armed = true; delb.textContent = '再按一次確認刪除'; return; }
          D.family = D.family.filter(function (x) { return x.id !== m.id; }); if (UI.filterWho === m.name) UI.filterWho = null;
          f.saveAll(); R.closeDlg(); R.render(); toast('已刪除，已填在保單與紀錄上的姓名不會變'); R.sync(true);
        });
        b.append(delb);
      }
    });
  }

  /* =============== 主畫面 =============== */
  var PAGES = { list: pageList, acct: pageAcct, plan: pagePlan, stat: pageStat, info: pageInfo };
  R.render = function () {
    $('whoLabel').innerHTML = '';
    $('whoLabel').append(cfg.who ? document.createTextNode('記帳人：') : document.createTextNode('尚未設定記帳人（到「基本資料」填寫）'));
    if (cfg.who) $('whoLabel').append(h('b', {}, cfg.who));
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === UI.tab); });
    var v = $('view'); var sy = window.scrollY;
    v.innerHTML = '';
    (PAGES[UI.tab] || pageList)(v);
    window.scrollTo(0, sy);
  };

  document.querySelectorAll('#nav button').forEach(function (b) {
    b.onclick = function () { UI.tab = b.dataset.p; R.render(); window.scrollTo(0, 0); };
  });
  $('syncBtn').onclick = function () { R.sync(false); };
  window.addEventListener('online', function () { R.sync(true); });
  $('dlg').addEventListener('click', function (ev) { if (ev.target === this) R.closeDlg(); });

  f.loadAll();
  if (!D.family.length && !D.policies.length) { /* 新使用者：保持空白 */ }
  f.autoRecordPolicies();
  R.render();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  R.sync(true);
})();
