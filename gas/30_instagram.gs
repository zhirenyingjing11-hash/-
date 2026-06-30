/**
 * 30_instagram.gs  ── Instagram 自動投稿（Graph API）
 * --------------------------------------------------
 * 前提:
 *   ・Instagram は「プロアカウント（ビジネス/クリエイター）」であること
 *   ・Facebookページと連携済みであること
 *   ・長期アクセストークン(IG_ACCESS_TOKEN)とビジネスID(IG_BUSINESS_ID)を取得済み
 *   ・画像は「公開URL」が必要（Amazonの商品画像URLをそのまま使えます）
 *
 * 注意: インスタはキャプション内のURLがリンクになりません。
 *       アフィリンクは「プロフィールのリンク（リンクインバイオ）」へ誘導する文言にしています。
 *
 * autoPostInstagram() を時間主導トリガーに設定すると、予約時刻が来た行を投稿します。
 * --------------------------------------------------
 */

const IG_GRAPH_VERSION = 'v21.0';

/** IGポストシートの予約投稿を1件ずつ確認して投稿（トリガー用） */
function autoPostInstagram() {
  const sh = getSS_().getSheetByName(SHEET_IG);
  if (!sh) { Logger.log('「' + SHEET_IG + '」シートがありません'); return; }
  const data = sh.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const when = data[i][0];          // A:日時
    const caption = String(data[i][1] || ''); // B:キャプション
    const imageUrl = String(data[i][2] || ''); // C:画像URL
    const status = String(data[i][3] || '').trim(); // D:状態

    if (status === '投稿済み' || status === 'エラー') continue;
    if (!(when instanceof Date)) continue;
    if (when.getTime() > now.getTime()) continue; // まだ時刻前
    if (!imageUrl) { sh.getRange(row, 4).setValue('エラー: 画像URLなし'); continue; }

    try {
      const id = postToInstagram_(imageUrl, caption);
      sh.getRange(row, 4).setValue('投稿済み');
      sh.getRange(row, 6).setValue(id); // F:投稿ID
    } catch (e) {
      sh.getRange(row, 4).setValue('エラー: ' + e.message);
    }
    SpreadsheetApp.flush();
  }
}

/** 画像URL＋キャプションでフィード投稿。成功するとメディアIDを返す */
function postToInstagram_(imageUrl, caption) {
  const c = getConfig_();
  if (!c.IG_ACCESS_TOKEN || !c.IG_BUSINESS_ID) {
    throw new Error('IG_ACCESS_TOKEN / IG_BUSINESS_ID が未設定です。');
  }
  const base = 'https://graph.facebook.com/' + IG_GRAPH_VERSION + '/';

  // ① メディアコンテナ作成
  const createResp = UrlFetchApp.fetch(base + c.IG_BUSINESS_ID + '/media', {
    method: 'post',
    payload: { image_url: imageUrl, caption: caption, access_token: c.IG_ACCESS_TOKEN },
    muteHttpExceptions: true
  });
  if (createResp.getResponseCode() !== 200) {
    throw new Error('コンテナ作成失敗: ' + createResp.getContentText());
  }
  const creationId = JSON.parse(createResp.getContentText()).id;

  // ② 公開
  const publishResp = UrlFetchApp.fetch(base + c.IG_BUSINESS_ID + '/media_publish', {
    method: 'post',
    payload: { creation_id: creationId, access_token: c.IG_ACCESS_TOKEN },
    muteHttpExceptions: true
  });
  if (publishResp.getResponseCode() !== 200) {
    throw new Error('公開失敗: ' + publishResp.getContentText());
  }
  return JSON.parse(publishResp.getContentText()).id;
}

/** Instagram自動投稿トリガーを15分おきに設置（初回のみ実行） */
function installInstagramTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoPostInstagram') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoPostInstagram').timeBased().everyMinutes(15).create();
  try { SpreadsheetApp.getActive().toast('Instagram自動投稿トリガーを設置しました（15分おき）'); } catch (e) {}
}
