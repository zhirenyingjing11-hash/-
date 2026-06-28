/**
 * 20_ai_writer.gs  ── AIで3媒体の文章を自動生成
 * --------------------------------------------------
 * 商品情報＋あなたのメモから、note / Instagram / Threads の文章を一括生成。
 * AI_PROVIDER（既定 'gemini'）に応じて Gemini か Claude を呼び出します。
 *
 * 出力（JSON）:
 *   {
 *     note: "（note用の長文記事）",
 *     instagram_caption: "（インスタ用キャプション）",
 *     instagram_hashtags: ["#..", ...],
 *     threads: "（Threads用ツイート 500字以内）",
 *     threads_hashtags: ["#..", ...]
 *   }
 * --------------------------------------------------
 */

/** 商品情報とメモから3媒体の文章を生成して返す */
function generateContents_(product, myMemo) {
  const prompt = buildWriterPrompt_(product, myMemo);
  const raw = callAI_(prompt);
  const data = parseJsonLoose_(raw);
  // 最低限のフォールバック整形
  return {
    note: String(data.note || '').trim(),
    instagram_caption: String(data.instagram_caption || '').trim(),
    instagram_hashtags: Array.isArray(data.instagram_hashtags) ? data.instagram_hashtags : [],
    threads: String(data.threads || '').trim(),
    threads_hashtags: Array.isArray(data.threads_hashtags) ? data.threads_hashtags : []
  };
}

/** 生成プロンプト（日本語・アフィリエイト向け） */
function buildWriterPrompt_(p, myMemo) {
  const features = (p.features || []).map(function (f) { return '・' + f; }).join('\n');
  return [
    'あなたは日本語のアフィリエイト記事・SNS投稿を書くプロのコピーライターです。',
    '以下の商品について、note / Instagram / Threads の3媒体向けに文章を作成してください。',
    '',
    '# 商品情報',
    '商品名: ' + (p.title || ''),
    '価格: ' + (p.price || '不明'),
    '特徴:\n' + (features || '（記載なし）'),
    '',
    '# 投稿者のメモ（実体験・推しポイント。必ず自然に反映）',
    (myMemo || '（特になし。商品情報から魅力的に）'),
    '',
    '# 媒体ごとの要件',
    '【note】読み物として成立する記事。導入→商品紹介→使ってみた感想→メリット/デメリット→こんな人におすすめ→まとめ、の流れ。1500〜2500字。見出しは「## 」で。リンクは本文には入れない（後で自動付与）。誇大表現・断定的な効能表現は避ける。',
    '【Instagram】1枚目で手が止まる書き出し→価値→保存したくなる締め。280字程度。絵文字を適度に。リンクは貼らない（インスタは本文リンク不可のため）。ハッシュタグは8〜12個を instagram_hashtags に分けて出す。',
    '【Threads】口語でテンポよく。500字以内（厳守）。本文中にURLは入れない。ハッシュタグは最大3個を threads_hashtags に分けて出す。',
    '',
    '# 出力形式（厳守）',
    '次のキーを持つ JSON のみを出力。前後に説明やコードフェンスを付けない。',
    '{"note":"...","instagram_caption":"...","instagram_hashtags":["#.."],"threads":"...","threads_hashtags":["#.."]}'
  ].join('\n');
}

/** AI_PROVIDER に応じて生成を実行 */
function callAI_(prompt) {
  const c = getConfig_();
  if (c.AI_PROVIDER === 'claude') return callClaude_(prompt, c.CLAUDE_API_KEY);
  return callGemini_(prompt, c.GEMINI_API_KEY);
}

/** Gemini API 呼び出し */
function callGemini_(prompt, apiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です。checkConfig() で確認してください。');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 4096, responseMimeType: 'application/json' }
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Geminiエラー(' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
  const json = JSON.parse(resp.getContentText());
  try {
    return json.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error('Gemini応答の解析に失敗: ' + resp.getContentText());
  }
}

/** Claude API 呼び出し */
function callClaude_(prompt, apiKey) {
  if (!apiKey) throw new Error('CLAUDE_API_KEY が未設定です。checkConfig() で確認してください。');
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Claudeエラー(' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
  const json = JSON.parse(resp.getContentText());
  try {
    return json.content[0].text;
  } catch (e) {
    throw new Error('Claude応答の解析に失敗: ' + resp.getContentText());
  }
}

/** コードフェンスや前後の余分を取り除いてJSONをパース */
function parseJsonLoose_(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.substring(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error('AI応答をJSONとして解釈できませんでした:\n' + text);
  }
}
