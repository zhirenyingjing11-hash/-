/**
 * 00_config.gs  ── 設定とシークレット管理
 * --------------------------------------------------
 * Amazonアフィリエイト自動投稿キット（拡張モジュール）の共通設定。
 *
 * APIキー等の秘密情報は「スクリプトプロパティ」に保存します。
 * 保存場所：Apps Scriptエディタ →（左）プロジェクトの設定 → スクリプトプロパティ
 *   もしくは下の setSecret('キー名','値') をエディタ上で1回ずつ実行。
 *
 * 必要なキー一覧（checkConfig() で過不足を確認できます）:
 *   AMAZON_ACCESS_KEY      … PA-API アクセスキー
 *   AMAZON_SECRET_KEY      … PA-API シークレットキー
 *   AMAZON_PARTNER_TAG     … アソシエイトのトラッキングID（例 yourid-22）
 *   GEMINI_API_KEY         … Gemini を使う場合
 *   CLAUDE_API_KEY         … Claude を使う場合
 *   IG_ACCESS_TOKEN        … Instagram Graph API の長期トークン
 *   IG_BUSINESS_ID         … Instagram ビジネスアカウントID（数字）
 *   AI_PROVIDER            … 'gemini'（既定）または 'claude'
 * --------------------------------------------------
 */

// ===== シート名（既存プロジェクトに合わせて変更可） =====
const SHEET_PRODUCTS = '商品マスタ';   // 商品の入力＆PA-API取得結果
const SHEET_IG       = 'IGポスト';     // Instagram 投稿キュー
const SHEET_NOTE     = 'noteドラフト'; // note 用の長文（手動コピペ）

// ===== Amazon PA-API（日本マーケットプレイス既定） =====
const PAAPI_HOST        = 'webservices.amazon.co.jp';
const PAAPI_REGION      = 'us-west-2';
const PAAPI_MARKETPLACE = 'www.amazon.co.jp';

// ===== AIモデル（必要に応じて変更） =====
const GEMINI_MODEL = 'gemini-2.0-flash';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

/** スクリプトプロパティから設定を読み出す（毎回最新を取得） */
function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return {
    AMAZON_ACCESS_KEY:  p.AMAZON_ACCESS_KEY  || '',
    AMAZON_SECRET_KEY:  p.AMAZON_SECRET_KEY  || '',
    AMAZON_PARTNER_TAG: p.AMAZON_PARTNER_TAG || '',
    GEMINI_API_KEY:     p.GEMINI_API_KEY     || '',
    CLAUDE_API_KEY:     p.CLAUDE_API_KEY     || '',
    IG_ACCESS_TOKEN:    p.IG_ACCESS_TOKEN    || '',
    IG_BUSINESS_ID:     p.IG_BUSINESS_ID     || '',
    AI_PROVIDER:        (p.AI_PROVIDER || 'gemini').toLowerCase()
  };
}

/** エディタ上で1回だけ実行してシークレットを保存するヘルパー */
function setSecret(key, value) {
  if (!key) throw new Error('キー名を指定してください');
  PropertiesService.getScriptProperties().setProperty(key, String(value));
  Logger.log('保存しました: ' + key);
}

/** 設定の過不足をログに出す（メニューからも実行可能） */
function checkConfig() {
  const c = getConfig_();
  const need = {
    'PA-API': ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'],
    'Instagram自動投稿': ['IG_ACCESS_TOKEN', 'IG_BUSINESS_ID'],
    'AI(Gemini)': ['GEMINI_API_KEY'],
    'AI(Claude)': ['CLAUDE_API_KEY']
  };
  const lines = [];
  Object.keys(need).forEach(function (group) {
    const missing = need[group].filter(function (k) { return !c[k]; });
    lines.push((missing.length ? '✗ ' : '✓ ') + group +
      (missing.length ? '（未設定: ' + missing.join(', ') + '）' : '（OK）'));
  });
  lines.push('使用AI: ' + c.AI_PROVIDER);
  // 現在の動作モード（PA-APIキーの有無で自動切替）
  const paapiReady = !!(c.AMAZON_ACCESS_KEY && c.AMAZON_SECRET_KEY && (c.AMAZON_PARTNER_TAG || getTrackingId_()));
  lines.push('動作モード: ' + (paapiReady ? 'PA-API（商品情報を自動取得）' : '手入力モード（商品名はB列に手入力）'));
  const msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('設定チェック', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}

// ===== 既存ファイル（threadsweekprep.gs 等）との橋渡し =====
// 既存の定数があればそれを使い、無ければここの既定値を使う（ReferenceError回避）。

/** トラッキングID（PartnerTag）を取得 */
function getTrackingId_() {
  if (typeof TRACKING_ID !== 'undefined' && TRACKING_ID && TRACKING_ID !== 'あなたのID-22') {
    return TRACKING_ID;
  }
  return getConfig_().AMAZON_PARTNER_TAG;
}

/** Threads投稿キューのシート名 */
function getPostSheetName_() {
  return (typeof POST_SHEET !== 'undefined' && POST_SHEET) ? POST_SHEET : '投稿';
}

/** 毎日の投稿枠（[時,分,ラベル]の配列） */
function getDailyTimes_() {
  if (typeof DAILY_TIMES !== 'undefined' && DAILY_TIMES.length) return DAILY_TIMES;
  return [[11, 30, 'ランチ前枠'], [18, 0, '夕飯前枠']];
}

/** ASINかキーワードからアフィリンクを生成（PA-AIのDetailPageURLが無いとき用の保険） */
function buildAffiliateUrl_(asinOrKeyword) {
  const v = String(asinOrKeyword || '').trim();
  if (!v) return '';
  const isAsin = /^[A-Z0-9]{10}$/.test(v);
  const base = isAsin
    ? 'https://www.amazon.co.jp/dp/' + v
    : 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(v);
  const join = base.indexOf('?') >= 0 ? '&' : '?';
  return base + join + 'tag=' + getTrackingId_();
}
