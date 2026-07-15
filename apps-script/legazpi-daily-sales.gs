/**
 * Legazpi Daily Sales Monitoring — StoreHub auto-pull
 * ====================================================
 * Bound Apps Script for the "Legazpi Daily Sales Monitoring" Google Sheet.
 * Adds a "StoreHub" menu with a "Pull Today's Sales" button that fetches the
 * day's transactions from the StoreHub API and writes payment-method totals
 * into the row matching today's (PHT) date.
 *
 * SETUP (one time, by the sheet owner):
 * 1. Open the sheet → Extensions → Apps Script, paste this file.
 * 2. Project Settings → Script Properties → add three properties, copying the
 *    values from .env.local / Vercel env of the branch-inventory app:
 *      STOREHUB_USERNAME   (= STOREHUB_USERNAME — the MKT/Legazpi account)
 *      STOREHUB_PASSWORD   (= STOREHUB_PASSWORD)
 *      STOREHUB_STORE_ID   (= STOREHUB_MKT_STORE_ID — Legazpi store)
 * 3. Project Settings → set the script time zone to Asia/Manila.
 *    Also set the spreadsheet time zone (File → Settings) to Asia/Manila.
 * 4. Adjust CONFIG below if the tab name or column layout differs.
 * 5. Reload the sheet — the "StoreHub" menu appears. First run per user asks
 *    for authorization (external requests + spreadsheet access).
 *
 * NIGHTLY RECONCILE (replaces "cron overwrites overnight"):
 * In the Apps Script editor → Triggers (clock icon) → Add Trigger →
 *   function: nightlyReconcile · event source: Time-driven ·
 *   type: Day timer · time: 1am–2am.
 * At that hour it re-pulls YESTERDAY's full business day and overwrites the
 * row, so the manual same-day pull always ends up reconciled.
 *
 * Column layout assumption (change CONFIG if wrong):
 *   A = Date · B = Cash · C = Credit Card · D = GCash · E = Maya Online ·
 *   F = Bank · G = Event (manual — never written) · H = SC · I = Gross Sales
 */

var CONFIG = {
  SHEET_NAME: 'Daily Sales',   // ← tab name of the monitoring sheet
  HEADER_ROWS: 1,              // rows to skip before date rows start
  DATE_COL: 1,                 // A
  // StoreHub paymentMethod label → column number. Labels must match the
  // BackOffice payment method names exactly (verified 2026-07 from live data).
  PAYMENT_COLUMNS: {
    'Cash': 2,                 // B
    'CreditCard': 3,           // C
    'GCash / QR Ph': 4,        // D
    'Maya Online': 5,          // E
    'Bank Transfer': 6,        // F
  },
  // Column G = Event: filled manually, intentionally untouched.
  SC_COL: 8,                   // H — service charge (StoreHub `serviceCharge`)
  GROSS_COL: 9,                // I
  TZ: 'Asia/Manila',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('StoreHub')
    .addItem("Pull Today's Sales", 'pullTodaySales')
    .addToUi();
}

/** Menu entry point — cashier-facing, shows toasts. */
function pullTodaySales() {
  runPull(phtDate(0), true);
}

/** Time-driven trigger entry point — pulls yesterday's closed business day. */
function nightlyReconcile() {
  runPull(phtDate(-1), false);
}

function runPull(date, interactive) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var txs = fetchTransactions(date);
    var agg = aggregate(txs);
    writeRow(date, agg);

    var msg = 'Pulled ' + agg.txCount + ' transactions, ₱' + fmt(agg.gross) + ' gross sales';
    var unmatchedNames = Object.keys(agg.unmatched).filter(function (m) {
      return Math.abs(agg.unmatched[m]) >= 0.01; // e.g. skip ₱0.00 "Comp" tenders
    });
    if (unmatchedNames.length) {
      msg += ' (not in a column: ' + unmatchedNames.map(function (m) {
        return m + ' ₱' + fmt(agg.unmatched[m]);
      }).join(', ') + ')';
    }
    if (interactive) ss.toast(msg, 'StoreHub — ' + date, 10);
    console.log(date + ': ' + msg);
  } catch (e) {
    if (interactive) ss.toast(String(e.message || e), 'StoreHub — pull failed', 10);
    console.error(date + ': ' + (e.stack || e));
    if (!interactive) throw e; // let trigger failures surface in Apps Script logs/emails
  }
}

/** "yyyy-MM-dd" in PHT, offset by N days (0 = today, -1 = yesterday). */
function phtDate(offsetDays) {
  return Utilities.formatDate(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000), CONFIG.TZ, 'yyyy-MM-dd');
}

/**
 * Fetch one day of transactions. Retries up to 3 times with backoff because
 * StoreHub returns non-JSON error bodies when rate-limited. A single day is
 * ~150–250 transactions — far below StoreHub's 5,000-row response cap.
 */
function fetchTransactions(date) {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty('STOREHUB_USERNAME');
  var pass = props.getProperty('STOREHUB_PASSWORD');
  var storeId = props.getProperty('STOREHUB_STORE_ID');
  if (!user || !pass || !storeId) {
    throw new Error('Missing Script Properties: STOREHUB_USERNAME / STOREHUB_PASSWORD / STOREHUB_STORE_ID. Ask the admin to set them (Extensions → Apps Script → Project Settings).');
  }

  var url = 'https://api.storehubhq.com/transactions'
    + '?storeId=' + encodeURIComponent(storeId)
    + '&from=' + date + '&to=' + date
    + '&includeOnline=true'; // required — online orders (Beep/Grab) excluded by default

  var lastDetail = '';
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Basic ' + Utilities.base64Encode(user + ':' + pass),
        Accept: 'application/json',
      },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code === 200) {
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        lastDetail = 'HTTP 200 but non-JSON body (rate limit)';
      }
    } else if (code === 401) {
      throw new Error('StoreHub rejected the credentials (401). Check the Script Properties.');
    } else {
      lastDetail = 'HTTP ' + code + ': ' + text.slice(0, 120);
    }
    if (attempt < 3) Utilities.sleep(2000 * attempt); // 2s, then 4s
  }
  throw new Error('StoreHub API failed after 3 attempts (' + lastDetail + '). Wait a minute and try again.');
}

/**
 * Aggregate a day's transactions into sheet columns.
 * Valid = not cancelled; Sales add, Returns subtract (both from the payment
 * method column and from gross). SC = `serviceCharge` (10% of discounted
 * subtotal when applied). Service charge is already embedded in `total`, so
 * the SC column is a breakout of gross, not an add-on line.
 * payments[] supports split tenders; sum(payments[].amount) === total on
 * every valid sale, so columns B–F (+ unmatched) reconcile to Gross.
 */
function aggregate(txs) {
  var byMethod = {};
  var unmatched = {};
  var sc = 0, gross = 0, txCount = 0;

  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    if (t.isCancelled) continue;
    var sign = t.transactionType === 'Sale' ? 1 : t.transactionType === 'Return' ? -1 : 0;
    if (sign === 0) continue;

    txCount++;
    gross += sign * (t.total || 0);
    sc += sign * (t.serviceCharge || 0);

    var payments = t.payments || [];
    for (var j = 0; j < payments.length; j++) {
      var method = payments[j].paymentMethod;
      var amount = sign * (payments[j].amount || 0);
      if (CONFIG.PAYMENT_COLUMNS[method]) {
        byMethod[method] = (byMethod[method] || 0) + amount;
      } else {
        unmatched[method] = (unmatched[method] || 0) + amount; // e.g. "Comp"
      }
    }
  }
  return { byMethod: byMethod, unmatched: unmatched, sc: sc, gross: gross, txCount: txCount };
}

/**
 * Write totals into the row whose column-A date matches `date` (overwriting
 * any previous pull). Appends a new row if the date isn't found.
 * Event column (G) is never written.
 */
function writeRow(date, agg) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Tab "' + CONFIG.SHEET_NAME + '" not found. Fix CONFIG.SHEET_NAME in the script.');
  }

  var row = findDateRow(sheet, date);
  if (row === -1) {
    row = sheet.getLastRow() + 1;
    // Real date value at PHT midnight so the cell formats like the rest.
    sheet.getRange(row, CONFIG.DATE_COL).setValue(new Date(date + 'T00:00:00+08:00'));
  }

  Object.keys(CONFIG.PAYMENT_COLUMNS).forEach(function (method) {
    sheet.getRange(row, CONFIG.PAYMENT_COLUMNS[method]).setValue(round2(agg.byMethod[method] || 0));
  });
  sheet.getRange(row, CONFIG.SC_COL).setValue(round2(agg.sc));
  sheet.getRange(row, CONFIG.GROSS_COL).setValue(round2(agg.gross));
}

/** Row index whose column-A value is `date` ("yyyy-MM-dd" PHT), or -1. */
function findDateRow(sheet, date) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROWS) return -1;
  var values = sheet
    .getRange(CONFIG.HEADER_ROWS + 1, CONFIG.DATE_COL, lastRow - CONFIG.HEADER_ROWS, 1)
    .getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v instanceof Date) {
      if (Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd') === date) return CONFIG.HEADER_ROWS + 1 + i;
    } else if (String(v).trim() === date) {
      return CONFIG.HEADER_ROWS + 1 + i;
    }
  }
  return -1;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fmt(n) {
  return round2(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
