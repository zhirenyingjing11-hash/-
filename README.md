# 株チャート予想 AI（ローカル / 完全無料）

株価チャートの画像をアップロードすると、**ローカルで動く無料の画像対応モデル（Ollama）** が
**出来高・テクニカル分析・ローソク足のサイン・投資家心理**を統合して読み取り、
今後の値動きを**複数の想定シナリオ＋確率配分**で提示する Web アプリです。

クラウド API を使わないため **トークン料金は一切かかりません**（モデルはあなたのPCで動きます）。

> ⚠️ 本システムは教育・情報提供を目的としたものであり、投資助言ではありません。
> 投資判断はご自身の責任で行ってください。

## 技術スタック

- Next.js (App Router) / TypeScript / React
- [Ollama](https://ollama.com)（ローカル LLM ランタイム）+ 画像対応モデル
- 構造化出力（JSON Schema）＋頑健な JSON 抽出で安定したレスポンス

## 必要なもの

- Node.js 18 以上
- [Ollama](https://ollama.com/download)（インストールするとローカルで LLM を実行可能）
- 画像対応モデルが動く程度の空きメモリ（既定モデルで概ね 6〜8GB 以上を推奨）

## セットアップ

1. **Ollama を導入してモデルを取得**

   ```bash
   # https://ollama.com/download からインストール後
   ollama serve            # サーバ起動（多くの環境では自動起動）
   ollama pull qwen2.5vl:7b   # 既定モデルを取得（数GBのDL）
   ```

   PC スペックに応じてモデルは変更できます:
   - 軽量PC: `moondream`（約1.7GB・軽いが精度は限定的）/ `llava:7b`
   - 中程度(既定): `qwen2.5vl:7b` / `llava:7b`
   - 高性能PC: `llama3.2-vision:11b` / `qwen2.5vl:32b`

2. **依存関係をインストール**

   ```bash
   npm install
   ```

3. **環境変数を設定**（既定のままでよければ省略可）

   ```bash
   cp .env.example .env.local
   # 必要に応じて OLLAMA_HOST / OLLAMA_MODEL を編集
   ```

4. **開発サーバーを起動**

   ```bash
   npm run dev
   ```

5. ブラウザで <http://localhost:3000> を開き、株価チャート画像（PNG/JPEG/GIF/WebP）を
   アップロードして「予想する」を押します。

## iPhone など同じ Wi-Fi の端末から使う

モデルはPCで動かしますが、**iPhone のブラウザから操作・写真アップロードは可能**です
（計算はPC側、iPhone は画面とカメラの役割）。同じ Wi-Fi 内で次の手順:

1. PC で Ollama を起動しておく（`ollama serve`／既定で常駐）。
2. PC でアプリを **LAN 公開モード**で起動:

   ```bash
   npm run dev:lan      # 本番は npm run build && npm run start:lan
   ```

3. PC の IP アドレスを調べる:
   - macOS: `ipconfig getifaddr en0`（例: `192.168.1.23`）
   - Windows: `ipconfig` → 「IPv4 アドレス」
4. iPhone の Safari で `http://<PCのIP>:3000`（例: `http://192.168.1.23:3000`）を開く。
5. チャートを**その場で撮影してアップロード**、または写真ライブラリから選択。

補足:
- 接続できない場合は PC のファイアウォールで 3000 番ポートの受信を許可してください。
- iPhone の写真は HEIC でも、Web アップロード時に自動で JPEG 変換されるため通常そのまま使えます。
- `OLLAMA_HOST` は PC 内の Ollama を指すので **`localhost:11434` のままで OK**（変更不要）。

> 外出先（モバイル回線）など Wi-Fi 外から使いたい場合は、クラウドへのデプロイ
> （GPU サーバー）か、クラウド API への切り替えが必要です。

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama の API エンドポイント |
| `OLLAMA_MODEL` | `qwen2.5vl:7b` | 使用する画像対応モデル（事前に `ollama pull` が必要） |

## 仕組み

```
ブラウザ(画像アップロード)
   └─ base64 化して POST /api/analyze
        └─ lib/ollama.ts が Ollama を呼び出し
             POST {OLLAMA_HOST}/api/chat（画像 + JSON Schema）
        └─ 出力を頑健に JSON 抽出・検証し、確率合計を 100% に正規化
   ←─ シナリオ配列・検出シグナル・投資家心理を JSON で返却
ブラウザ(確率バー付きシナリオカード等を表示)
```

主要ファイル:

- `app/page.tsx` — アップロード UI と結果表示
- `app/api/analyze/route.ts` — 解析 API
- `lib/ollama.ts` — Ollama 呼び出し（接続不可・モデル未取得時は分かりやすいエラー）
- `lib/schema.ts` — レスポンスの zod / JSON Schema 定義、JSON 抽出、確率正規化
- `lib/prompt.ts` — 分析観点（出来高/テクニカル/ローソク足/心理）と JSON 出力の指示

## トラブルシューティング

- **「Ollama に接続できません」** → `ollama serve` が起動しているか、`OLLAMA_HOST` が正しいか確認。
- **「モデルが見つかりません」** → `ollama pull <OLLAMA_MODEL の値>` を実行。
- **出力を解析できない** → モデルが JSON 以外を返している可能性。`OLLAMA_MODEL` を
  指示追従性の高いモデル（例: `qwen2.5vl:7b`）に変更すると安定します。

## 出力されるシナリオ

各シナリオには次が含まれます:

- 方向（上昇 / 下落 / 横ばい）
- 確率(%)（全シナリオ合計 100%）
- 想定値動き（値幅・期間の目安）
- 根拠（どのサイン・指標・心理に基づくか）

加えて、検出されたローソク足パターン・テクニカル指標・出来高所見・投資家心理の総括を表示します。
