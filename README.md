# 株チャート予想 AI

株価チャートの画像をアップロードすると、**Claude Vision API** が
**出来高・テクニカル分析・ローソク足のサイン・投資家心理**を統合して読み取り、
今後の値動きを**複数の想定シナリオ＋確率配分**で提示する Web アプリです。

> ⚠️ 本システムは教育・情報提供を目的としたものであり、投資助言ではありません。
> 投資判断はご自身の責任で行ってください。

## 技術スタック

- Next.js (App Router) / TypeScript / React
- Anthropic Claude Vision API (`claude-opus-4-8`)
- structured outputs（JSON Schema）で安定した構造化レスポンス

## セットアップ

1. 依存関係をインストール

   ```bash
   npm install
   ```

2. API キーを設定（[Anthropic Console](https://console.anthropic.com) で取得）

   ```bash
   cp .env.example .env.local
   # .env.local を編集して ANTHROPIC_API_KEY を設定
   ```

3. 開発サーバーを起動

   ```bash
   npm run dev
   ```

4. ブラウザで <http://localhost:3000> を開き、株価チャート画像（PNG/JPEG/GIF/WebP）を
   アップロードして「予想する」を押します。

## 仕組み

```
ブラウザ(画像アップロード)
   └─ base64 化して POST /api/analyze
        └─ lib/anthropic.ts が Claude Vision を呼び出し（画像 + 構造化スキーマ）
        └─ 確率合計を 100% に正規化
   ←─ シナリオ配列・検出シグナル・投資家心理を JSON で返却
ブラウザ(確率バー付きシナリオカード等を表示)
```

主要ファイル:

- `app/page.tsx` — アップロード UI と結果表示
- `app/api/analyze/route.ts` — 解析 API（サーバー側で API キーを保持）
- `lib/anthropic.ts` — Claude Vision 呼び出し
- `lib/schema.ts` — レスポンスの zod / JSON Schema 定義と確率正規化
- `lib/prompt.ts` — 分析観点を指示するシステムプロンプト

## 出力されるシナリオ

各シナリオには次が含まれます:

- 方向（上昇 / 下落 / 横ばい）
- 確率(%)（全シナリオ合計 100%）
- 想定値動き（値幅・期間の目安）
- 根拠（どのサイン・指標・心理に基づくか）

加えて、検出されたローソク足パターン・テクニカル指標・出来高所見・投資家心理の総括を表示します。
