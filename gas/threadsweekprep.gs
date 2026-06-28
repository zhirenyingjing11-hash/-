/**
 * 食レポ運用キット（threads-auto-post.gs と同じプロジェクトに追加して使う）
 * --------------------------------------------------
 *  ・prepareWeek() : 翌日から7日分の「投稿枠」を最適時間で「投稿」シートに自動生成
 *  ・checkPosts()  : 予約中の投稿を食レポのルールで自動チェック（出す前の安全確認）
 *  ・AFFILIATE()   : シートで使える関数。ASINか検索ワードからアフィリンクを生成
 *  ・onOpen()      : スプレッドシートに「食レポ運用」メニューを追加（PC版で表示）
 * --------------------------------------------------
 */

// ① あなたのトラッキングID（AFFILIATE関数が使う）
const TRACKING_ID = 'あなたのID-22';

// ② 毎日この時間に投稿枠を作る（食レポのゴールデンタイム：ランチ前・夕飯前）
//    [時, 分, ラベル] を好きに足し引きしてください。
const DAILY_TIMES = [
  [11, 30, 'ランチ前枠'],
  [18, 0, '夕飯前枠'],
];

// 食レポのルール（あなたの運用スタイル）
const MAX_CHARS = 500;      // Threads想定の本文上限
const MAX_HASHTAGS = 5;     // ハッシュタグは最大5個
const STORE_INFO_HINTS = ['営業時間', '定休', '駐車', '住所']; // 店情報の目印

// ※ onOpen（メニュー表示）は 50_menu.gs に統合しました。
//    1プロジェクトに onOpen は1つだけのため、ここでは定義しません。
//    食レポ運用の各機能（prepareWeek / checkPosts 等）はそのまま使えます。

/** 翌日から7日分の投稿枠を「投稿」シートに作成（中身は後から書く） */
function prepareWeek() {
  const sh = SpreadsheetApp.getActive().getSheetByName(POST_SHEET);
  if (!sh) throw new Error('「投稿」シートが見つかりません');

  // 既存の予約時刻を集めて重複を防ぐ
  const existing = {};
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] instanceof Date) existing[data[i][0].getTime()] = true;
  }

  const today = new Date();
  let added = 0;
  for (let d = 1; d <= 7; d++) {               // 翌日〜7日後
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    DAILY_TIMES.forEach(function (slot) {
      const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), slot[0], slot[1]);
      if (existing[when.getTime()]) return;     // すでにある枠は飛ばす
      sh.appendRow([when, '', '', '', slot[2], '']); // A日時 B本文 C画像 D状態 E(ラベル) F
      added++;
    });
  }
  SpreadsheetApp.getActive().toast(added + '件の投稿枠を作成しました。本文を書き込んでください。');
}

/** 予約中（状態が空）の投稿を食レポのルールでチェックしてメモ欄に結果を書く */
function checkPosts() {
  const sh = SpreadsheetApp.getActive().getSheetByName(POST_SHEET);
  if (!sh) throw new Error('「投稿」シートが見つかりません');
  const data = sh.getDataRange().getValues();
  let flagged = 0;

  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const text = String(data[i][1] || '');
    const status = String(data[i][3] || '').trim();
    if (status === '投稿済み' || status === 'エラー') continue; // 出した後は触らない
    if (!text.trim()) continue;                                 // 本文未記入はスルー

    const warns = [];

    if (text.length > MAX_CHARS) {
      warns.push('⚠ 本文' + text.length + '字（' + MAX_CHARS + '字以内に）');
    }
    const tags = (text.match(/#[^\s#]+/g) || []);
    if (tags.length > MAX_HASHTAGS) {
      warns.push('⚠ ハッシュタグ' + tags.length + '個（' + MAX_HASHTAGS + '個以内に）');
    }
    if (/https?:\/\//.test(text)) {
      warns.push('⚠ 本文にURL（Threadsは会話の最後かプロフィールへ）');
    }
    const hasStoreInfo = STORE_INFO_HINTS.some(function (k) { return text.indexOf(k) >= 0; });
    if (!hasStoreInfo) {
      warns.push('💡 店情報（営業時間/定休/駐車）が見当たりません');
    }

    sh.getRange(row, 5).setValue(warns.length ? warns.join(' / ') : '✓ OK');
    if (warns.length) flagged++;
  }
  SpreadsheetApp.getActive().toast(flagged ? flagged + '件に注意あり。メモ欄を確認してください。' : '全部OKです。');
}

/**
 * シートで使えるアフィリンク生成関数。
 *   =AFFILIATE("B0XXXXXXXX")     → 商品直リンク
 *   =AFFILIATE("ハイボール グラス") → 検索リンク
 */
function AFFILIATE(asinOrKeyword) {
  if (!asinOrKeyword) return '';
  const v = String(asinOrKeyword).trim();
  const isAsin = /^[A-Z0-9]{10}$/.test(v);
  const base = isAsin
    ? 'https://www.amazon.co.jp/dp/' + v
    : 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(v);
  const join = base.indexOf('?') >= 0 ? '&' : '?';
  return base + join + 'tag=' + TRACKING_ID;
}
