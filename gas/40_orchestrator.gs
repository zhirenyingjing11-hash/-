/**
 * 40_orchestrator.gs  ── 全体の司令塔
 * --------------------------------------------------
 * generateAll()  : 「商品マスタ」の各行について
 *    1. PA-APIで商品情報＋アフィリンクを自動取得
 *    2. AIで note / Instagram / Threads の文章を生成
 *    3. Threads → 「投稿」シート、Instagram → 「IGポスト」シート、note → 「noteドラフト」シートへ書き出し
 *    4. アフィリンクを媒体ごとの作法で付与
 *
 * 商品マスタの列:
 *   A: ASIN/検索ワード（あなたが入力）
 *   B: 商品名（自動）  C: 価格（自動）  D: 画像URL（自動）  E: アフィリンク（自動）
 *   F: あなたのメモ（実体験・推しポイントを入力）
 *   G: 状態（自動）    H: 生成日時（自動）
 * --------------------------------------------------
 */

/** 必要なシートが無ければ見出し付きで作成 */
function setupSheets() {
  const ss = SpreadsheetApp.getActive();

  ensureSheet_(ss, SHEET_PRODUCTS,
    ['ASIN/検索ワード', '商品名', '価格', '画像URL', 'アフィリンク', 'あなたのメモ', '状態', '生成日時']);
  ensureSheet_(ss, SHEET_IG,
    ['日時', 'キャプション', '画像URL', '状態', 'アフィリンク', '投稿ID']);
  ensureSheet_(ss, SHEET_NOTE,
    ['作成日', 'タイトル', '本文', '商品名', 'アフィリンク']);

  // Threads投稿シート（既存が無ければ最低限の見出しで用意）
  const post = ss.getSheetByName(getPostSheetName_());
  if (!post) {
    ensureSheet_(ss, getPostSheetName_(), ['日時', '本文', '画像', '状態', 'ラベル', '備考']);
  }
  try { ss.toast('シートを準備しました'); } catch (e) {}
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** メイン: 商品マスタの未生成行をまとめて処理 */
function generateAll() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sh) { setupSheets(); throw new Error('「' + SHEET_PRODUCTS + '」を作成しました。商品を入力して再実行してください。'); }

  const data = sh.getDataRange().getValues();
  let done = 0, failed = 0;

  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const input = String(data[i][0] || '').trim();   // A
    const memo = String(data[i][5] || '').trim();     // F
    const status = String(data[i][6] || '').trim();   // G
    if (!input) continue;
    if (status === '生成済み') continue;              // 再生成したい時はGを空に

    try {
      sh.getRange(row, 7).setValue('処理中…');
      SpreadsheetApp.flush();

      // 1) 商品情報取得
      const product = fetchProduct_(input);
      sh.getRange(row, 2, 1, 4).setValues([[product.title, product.price, product.imageUrl, product.url]]);

      // 2) 文章生成
      const c = generateContents_(product, memo);

      // 3) 各媒体へ書き出し
      writeThreads_(ss, c, product);
      writeInstagram_(ss, c, product);
      writeNote_(ss, c, product);

      sh.getRange(row, 7).setValue('生成済み');
      sh.getRange(row, 8).setValue(new Date());
      done++;
    } catch (e) {
      sh.getRange(row, 7).setValue('エラー: ' + e.message);
      failed++;
    }
    SpreadsheetApp.flush();
  }

  const msg = '生成完了: ' + done + '件' + (failed ? ' / 失敗 ' + failed + '件' : '');
  try { ss.toast(msg); } catch (e) {}
  Logger.log(msg);
}

// ===== 媒体別の書き出し =====

/** Threads → 「投稿」シート（A日時 B本文 C画像 D状態 …） */
function writeThreads_(ss, c, product) {
  const sh = ss.getSheetByName(getPostSheetName_());
  if (!sh) return;
  const tags = (c.threads_hashtags || []).slice(0, 3).join(' ');
  // Threadsは本文にURLを入れない作法。末尾に「↓」とアフィリンクを別行で（返信/プロフィール運用に流用しやすい）
  let body = c.threads;
  if (tags) body += '\n\n' + tags;
  body += '\n\n🔗 ' + product.url; // リンクは末尾。会話の最初の返信に貼る運用でもOK
  const when = nextFreeSlot_(sh, 1);
  sh.appendRow([when, body, product.imageUrl, '', 'アフィリ', product.title]);
}

/** Instagram → 「IGポスト」シート */
function writeInstagram_(ss, c, product) {
  const sh = ss.getSheetByName(SHEET_IG);
  if (!sh) return;
  const tags = (c.instagram_hashtags || []).join(' ');
  // インスタは本文リンク不可 → プロフィール誘導文 + ハッシュタグ
  let caption = c.instagram_caption +
    '\n\n🛒 商品はプロフィールのリンクからチェックできます' +
    (tags ? '\n\n' + tags : '');
  const when = nextFreeSlot_(sh, 1);
  sh.appendRow([when, caption, product.imageUrl, '', product.url, '']);
}

/** note → 「noteドラフト」シート（手動コピペ用。本文末尾にアフィリンクを埋め込み） */
function writeNote_(ss, c, product) {
  const sh = ss.getSheetByName(SHEET_NOTE);
  if (!sh) return;
  const body = c.note +
    '\n\n---\n▼ 今回紹介した商品はこちら\n' + product.title +
    (product.price ? '（' + product.price + '）' : '') +
    '\n' + product.url +
    '\n\n※本記事はアフィリエイトリンクを含みます。';
  const title = extractNoteTitle_(c.note, product.title);
  sh.appendRow([new Date(), title, body, product.title, product.url]);
}

/** note本文の最初の見出し/行からタイトルを推定 */
function extractNoteTitle_(noteText, fallback) {
  const lines = String(noteText || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].replace(/^#+\s*/, '').trim();
    if (t) return t.length > 60 ? t.substring(0, 60) : t;
  }
  return fallback;
}

/** 翌日以降で、まだ使われていない最初の投稿枠(DAILY_TIMES)を返す */
function nextFreeSlot_(sheet, dateCol) {
  const used = {};
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const v = data[i][dateCol - 1];
    if (v instanceof Date) used[v.getTime()] = true;
  }
  const slots = getDailyTimes_();
  const today = new Date();
  for (let d = 1; d <= 60; d++) {
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    for (let s = 0; s < slots.length; s++) {
      const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), slots[s][0], slots[s][1]);
      if (!used[when.getTime()]) { used[when.getTime()] = true; return when; }
    }
  }
  return new Date(today.getTime() + 24 * 3600 * 1000); // 念のためのフォールバック
}
