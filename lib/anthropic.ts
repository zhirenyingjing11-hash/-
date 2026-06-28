import Anthropic from "@anthropic-ai/sdk";
import {
  analysisSchema,
  analysisJsonSchema,
  normalizeProbabilities,
  type Analysis,
} from "./schema";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";

// Claude Vision が受け付ける画像メディアタイプ
export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

// 構造化レスポンスを得るための強制ツール。
// output_config(structured outputs) が無い SDK でも安定して JSON を得られる方式。
const REPORT_TOOL_NAME = "report_chart_analysis";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。",
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * チャート画像(base64)を Claude Vision で分析し、構造化された予想結果を返す。
 */
export async function analyzeChart(
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<Analysis> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: REPORT_TOOL_NAME,
        description:
          "チャート分析の結果（想定シナリオと確率配分、検出シグナル、投資家心理）を構造化して報告する。",
        input_schema: analysisJsonSchema as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    // 必ずこのツールを使わせ、入力として構造化 JSON を生成させる
    tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  // 強制ツール使用なので tool_use ブロックの input に構造化結果が入る
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("モデルから構造化された分析結果を取得できませんでした。");
  }

  const parsed = analysisSchema.parse(toolUse.input);

  // 確率の合計を 100 に正規化
  return {
    ...parsed,
    scenarios: normalizeProbabilities(parsed.scenarios),
  };
}
