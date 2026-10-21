/**
 * 隨手記帳 → Google 試算表 接收程式
 *
 * 使用方式：
 * 1. 開一份 Google 試算表 → 擴充功能 → Apps Script，貼上這份程式碼
 * 2. 把下面的 TOKEN 改成你自己的一串文字（App「設定」裡要填一樣的）
 * 3. 部署 → 新增部署 → 類型選「網頁應用程式」
 *    執行身分：我；誰可以存取：所有人
 * 4. 把產生的網址（結尾是 /exec）貼到 App 的「設定」
 */
var TOKEN = '請改成你自己的密語';
var SHEET_NAME = '隨手記帳';
var HEADERS = ['ID', '日期', '類型', '金額', '分類', '帳戶', '轉入帳戶', '備註', '分期期數', '建立時間', '記帳人', '幣別', '花費對象', '匯率'];

// App 會把帳戶、保單與分期、家人、匯率整份送來，覆蓋寫入下面這幾張分頁
var SNAP_SHEETS = {
  accounts: { name: '帳戶', head: ['名稱', '幣別', '類型', '期初餘額', '目前餘額', '結帳日', '繳款日', '自動扣款', '繳款帳戶'],
    keys: ['name', 'cur', 'kind', 'opening', 'balance', 'closeDay', 'dueDay', 'auto', 'payAcct'] },
  policies: { name: '保單與分期', head: ['名稱', '類型', '要保人', '被保人', '保險公司', '扣款帳戶', '頻率', '每期金額', '首期金額', '第一期日', '總期數', '剩餘期數', '剩餘金額', '下次扣款', '投保始期', '繳費年期', '保障期間'],
    keys: ['name', 'kind', 'holder', 'insured', 'insurer', 'acct', 'freq', 'amount', 'firstAmt', 'first', 'total', 'leftN', 'leftSum', 'next', 'start', 'payYears', 'term'] },
  family: { name: '家人', head: ['姓名', '關係', '生日', '備註'], keys: ['name', 'rel', 'birth', 'note'] },
  rates: { name: '匯率', head: ['幣別', '對台幣匯率'], keys: ['cur', 'rate'] }
};

function doGet() {
  return json_({ ok: true, message: '隨手記帳接收程式運作中' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.token !== TOKEN) {
      return json_({ ok: false, error: '密語不正確' });
    }
    var records = body.records || [];
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet_();
      var lastRow = sheet.getLastRow();
      var existing = {};   // ID -> 列號
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r, i) {
          existing[String(r[0])] = i + 2;
        });
      }
      var rows = [], saved = [];
      records.forEach(function (r) {
        saved.push(r.id);
        var row = [r.id, r.date, r.type, r.amount, r.category, r.account,
                   r.toAccount, r.note, r.periods || '', r.created, r.who || '', r.cur || '', r.target || '', r.rate || ''];
        if (existing[String(r.id)]) {            // 已存在：App 裡修改過就更新那一列
          sheet.getRange(existing[String(r.id)], 1, 1, HEADERS.length).setValues([row]);
        } else rows.push(row);
      });
      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      }
      var snapDone = false;
      if (body.snapshot) { writeSnapshot_(body.snapshot); snapDone = true; }
      return json_({ ok: true, saved: saved, snapshot: snapDone });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function writeSnapshot_(snap) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SNAP_SHEETS).forEach(function (k) {
    var def = SNAP_SHEETS[k], list = snap[k] || [];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    sh.clearContents();
    var data = [def.head].concat(list.map(function (o) {
      return def.keys.map(function (key) { return o[key] === undefined ? '' : o[key]; });
    }));
    sh.getRange(1, 1, data.length, def.head.length).setValues(data);
    sh.getRange(1, 1, 1, def.head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setFrozenRows(1);
  }
  // 標題列和程式不一致時（例如新增了「記帳人」欄），自動補上，不動下面的資料
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (current.join('|') !== HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
