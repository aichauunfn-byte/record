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
var HEADERS = ['ID', '日期', '類型', '金額', '分類', '帳戶', '轉入帳戶', '備註', '分期期數', '建立時間'];

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
      var existing = {};
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r) {
          existing[String(r[0])] = true;
        });
      }
      var rows = [], saved = [];
      records.forEach(function (r) {
        saved.push(r.id);                       // 已存在的也回報成功，避免 App 一直重送
        if (existing[String(r.id)]) return;
        rows.push([r.id, r.date, r.type, r.amount, r.category, r.account,
                   r.toAccount, r.note, r.periods || '', r.created]);
      });
      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      }
      return json_({ ok: true, saved: saved });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
