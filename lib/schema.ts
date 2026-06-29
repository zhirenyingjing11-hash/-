import { z } from "zod";

/**
 * Claude Vision に返させる解析結果のスキーマ。
 * zod を型とランタイム検証の単一ソースにし、JSON Schema は
 * Anthropic の structured outputs (output_config.format) 用に手書きで対応させる。
 */

export const directionSchema = z.enum(["up", "down", "sideways"]);
export type Direction = z.infer<typeof directionSchema>;

export const scenarioSchema = z.object({
  label: z.string(), // 例: 「上昇継続」「レンジ」「下落転換」
  direction: directionSchema,
  probability: z.number(), // %（モデルには合計100を指示。最終的にサーバーで正規化）
  expected_move: z.string(), // 値幅・期間の目安
  rationale: z.string(), // 出来高/テクニカル/ローソク足に基づく根拠
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const detectedSignalsSchema = z.object({
  candlestick_patterns: z.array(z.string()),
  volume_analysis: z.string(),
  technical_indicators: z.array(z.string()),
});

export const analysisSchema = z.object({
  symbol_guess: z.string().nullable(),
  timeframe: z.string(),
  detected_signals: detectedSignalsSchema,
  scenarios: z.array(scenarioSchema).min(2).max(4),
  investor_psychology: z.string(),
  disclaimer: z.string(),
});
export type Analysis = z.infer<typeof analysisSchema>;

/**
 * Anthropic structured outputs 用の JSON Schema。
 * すべてのオブジェクトで additionalProperties:false / required を満たす必要がある。
 */
export const analysisJsonSchema = {
  type: "object",
  properties: {
    symbol_guess: {
      type: ["string", "null"],
      description: "チャートから読み取れる銘柄名やコード。不明なら null",
    },
    timeframe: {
      type: "string",
      description: "チャートの時間軸の推測（例: 日足、週足、5分足）",
    },
    detected_signals: {
      type: "object",
      properties: {
        candlestick_patterns: {
          type: "array",
          items: { type: "string" },
          description: "検出したローソク足のサイン（例: 陽の包み足、はらみ線、十字線）",
        },
        volume_analysis: {
          type: "string",
          description: "出来高の所見（増減、価格との関係、出来高を伴うブレイクなど）",
        },
        technical_indicators: {
          type: "array",
          items: { type: "string" },
          description:
            "移動平均線・トレンドライン・サポート/レジスタンス・各種オシレーターなどの所見",
        },
      },
      required: ["candlestick_patterns", "volume_analysis", "technical_indicators"],
      additionalProperties: false,
    },
    scenarios: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      description: "今後の値動きの想定シナリオ。probability の合計が 100 になるようにする",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "シナリオ名（例: 上昇継続、レンジ、下落転換）" },
          direction: {
            type: "string",
            enum: ["up", "down", "sideways"],
            description: "想定される方向",
          },
          probability: {
            type: "integer",
            description: "そのシナリオになる確率(%)。全シナリオ合計で100",
          },
          expected_move: { type: "string", description: "想定される値幅・到達目安・期間" },
          rationale: {
            type: "string",
            description: "出来高・テクニカル・ローソク足・投資家心理に基づく根拠",
          },
        },
        required: ["label", "direction", "probability", "expected_move", "rationale"],
        additionalProperties: false,
      },
    },
    investor_psychology: {
      type: "string",
      description: "現在の投資家心理の総括（強気/弱気、恐怖と欲望、需給バランスなど）",
    },
    disclaimer: {
      type: "string",
      description: "本予想が投資助言ではない旨の注意書き（日本語）",
    },
  },
  required: [
    "symbol_guess",
    "timeframe",
    "detected_signals",
    "scenarios",
    "investor_psychology",
    "disclaimer",
  ],
  additionalProperties: false,
} as const;

/**
 * モデル出力の文字列から JSON オブジェクト部分を抽出する。
 * ローカルモデルは前後に説明文やコードフェンス(```json)を付けがちなため、
 * 最初の "{" から対応する最後の "}" までを取り出す簡易抽出を行う。
 */
export function extractJson(text: string): string | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/**
 * シナリオの probability 合計を 100 に正規化する。
 * モデル出力が合計100からずれても UI が破綻しないようにする。
 */
export function normalizeProbabilities(scenarios: Scenario[]): Scenario[] {
  const total = scenarios.reduce((sum, s) => sum + (s.probability || 0), 0);
  if (total <= 0) {
    // すべて0など異常時は均等割り
    const even = Math.round(100 / scenarios.length);
    return scenarios.map((s) => ({ ...s, probability: even }));
  }
  // 比率でスケールし四捨五入、最後に端数を先頭へ寄せて合計100に揃える
  const scaled = scenarios.map((s) => ({
    ...s,
    probability: Math.round((s.probability / total) * 100),
  }));
  const diff = 100 - scaled.reduce((sum, s) => sum + s.probability, 0);
  if (scaled.length > 0) scaled[0].probability += diff;
  return scaled;
}
