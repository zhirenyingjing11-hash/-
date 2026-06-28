/**
 * 10_amazon_paapi.gs  ── Amazon Product Advertising API v5 連携
 * --------------------------------------------------
 * ASIN または検索ワードから、商品名・価格・画像URL・アフィリンクを自動取得。
 * AWS Signature V4 で署名してPA-APIを呼び出します（外部ライブラリ不要）。
 *
 * 使い方（コードから）:
 *   const item = fetchProduct_('B0XXXXXXXX');         // ASIN直指定
 *   const item = fetchProduct_('ハイボール グラス');   // 検索（先頭1件）
 *   → { asin, title, price, imageUrl, features:[...], url }
 * --------------------------------------------------
 */

/** ASINらしき文字列ならGetItems、そうでなければSearchItemsで先頭1件を返す */
function fetchProduct_(asinOrKeyword) {
  const v = String(asinOrKeyword || '').trim();
  if (!v) throw new Error('ASINまたは検索ワードが空です');

  const resources = [
    'ItemInfo.Title',
    'ItemInfo.Features',
    'Offers.Listings.Price',
    'Images.Primary.Large'
  ];

  let item;
  if (/^[A-Z0-9]{10}$/.test(v)) {
    const res = paapiRequest_('GetItems', {
      ItemIds: [v],
      ItemIdType: 'ASIN',
      Resources: resources
    });
    item = res.ItemsResult && res.ItemsResult.Items && res.ItemsResult.Items[0];
  } else {
    const res = paapiRequest_('SearchItems', {
      Keywords: v,
      SearchIndex: 'All',
      ItemCount: 1,
      Resources: resources
    });
    item = res.SearchResult && res.SearchResult.Items && res.SearchResult.Items[0];
  }
  if (!item) throw new Error('商品が見つかりませんでした: ' + v);

  return normalizeItem_(item);
}

/** PA-APIのItemを使いやすい形に整形 */
function normalizeItem_(item) {
  const info = item.ItemInfo || {};
  const title = info.Title && info.Title.DisplayValue || '';
  const features = (info.Features && info.Features.DisplayValues) || [];
  let price = '';
  try { price = item.Offers.Listings[0].Price.DisplayAmount || ''; } catch (e) {}
  let imageUrl = '';
  try { imageUrl = item.Images.Primary.Large.URL || ''; } catch (e) {}
  // DetailPageURL は既にPartnerTagが付与済みのアフィリンク
  const url = item.DetailPageURL || buildAffiliateUrl_(item.ASIN);
  return {
    asin: item.ASIN || '',
    title: title,
    price: price,
    imageUrl: imageUrl,
    features: features,
    url: url
  };
}

/** PA-APIへ署名付きPOST。operation は 'GetItems' か 'SearchItems' */
function paapiRequest_(operation, payloadObj) {
  const c = getConfig_();
  if (!c.AMAZON_ACCESS_KEY || !c.AMAZON_SECRET_KEY) {
    throw new Error('PA-APIのキーが未設定です。checkConfig() で確認してください。');
  }
  const partnerTag = c.AMAZON_PARTNER_TAG || getTrackingId_();
  if (!partnerTag) throw new Error('AMAZON_PARTNER_TAG（トラッキングID）が未設定です。');

  const host = PAAPI_HOST;
  const region = PAAPI_REGION;
  const service = 'ProductAdvertisingAPI';
  const path = operation === 'SearchItems' ? '/paapi5/searchitems' : '/paapi5/getitems';
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.' + operation;

  payloadObj.PartnerTag = partnerTag;
  payloadObj.PartnerType = 'Associates';
  payloadObj.Marketplace = PAAPI_MARKETPLACE;
  const payload = JSON.stringify(payloadObj);

  const now = new Date();
  const amzDate = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const dateStamp = amzDate.substring(0, 8);
  const contentType = 'application/json; charset=utf-8';

  // --- 正規リクエスト（ヘッダはキー昇順・小文字） ---
  const canonicalHeaders =
    'content-encoding:amz-1.0\n' +
    'content-type:' + contentType + '\n' +
    'host:' + host + '\n' +
    'x-amz-date:' + amzDate + '\n' +
    'x-amz-target:' + target + '\n';
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const payloadHash = hexSha256_(payload);
  const canonicalRequest = [
    'POST', path, '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  // --- 署名対象文字列 ---
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = [dateStamp, region, service, 'aws4_request'].join('/');
  const stringToSign = [
    algorithm, amzDate, credentialScope, hexSha256_(canonicalRequest)
  ].join('\n');

  // --- 署名 ---
  const signingKey = getSignatureKey_(c.AMAZON_SECRET_KEY, dateStamp, region, service);
  const signature = toHex_(hmac_(signingKey, stringToSign));
  const authorization = algorithm + ' ' +
    'Credential=' + c.AMAZON_ACCESS_KEY + '/' + credentialScope + ', ' +
    'SignedHeaders=' + signedHeaders + ', ' +
    'Signature=' + signature;

  const resp = UrlFetchApp.fetch('https://' + host + path, {
    method: 'post',
    contentType: contentType,
    headers: {
      'content-encoding': 'amz-1.0',
      'x-amz-date': amzDate,
      'x-amz-target': target,
      'Authorization': authorization
    },
    payload: payload,
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('PA-APIエラー(' + code + '): ' + body);
  }
  return JSON.parse(body);
}

// ===== 署名ユーティリティ =====

/** HMAC-SHA256（鍵: Byte[]、メッセージ: String）→ Byte[] */
function hmac_(keyBytes, msg) {
  return Utilities.computeHmacSha256Signature(Utilities.newBlob(msg).getBytes(), keyBytes);
}

/** AWS SigV4 の署名鍵を導出 */
function getSignatureKey_(secret, dateStamp, region, service) {
  const kDate = hmac_(Utilities.newBlob('AWS4' + secret).getBytes(), dateStamp);
  const kRegion = hmac_(kDate, region);
  const kService = hmac_(kRegion, service);
  return hmac_(kService, 'aws4_request');
}

/** SHA-256 の16進ダイジェスト */
function hexSha256_(msg) {
  return toHex_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, msg, Utilities.Charset.UTF_8));
}

/** Byte[] → 小文字16進文字列 */
function toHex_(bytes) {
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}
