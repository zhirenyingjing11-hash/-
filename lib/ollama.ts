import {
  analysisSchema,
  analysisJsonSchema,
  normalizeProbabilities,
  extractJson,
  type Analysis,
} from "./schema";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";

// /api/analyze 側と互換のため型は残す（Ollama 自体は media type 不要）
export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5vl:7b";

/** ユーザーに分かりやすいメッセージを持つ専用エラー */
export class OllamaError extends Error {}

const STRICT_NUDGE =
  "\n\n重要: 指定された JSON スキーマに厳密に従い、JSON オブジェクトのみを出力してください。前後に説明文・コードフェンス・コメントを一切付けないこと。";

/** Ollama の /api/chat を 1 回呼び、message.content（文字列）を返す */
async function callOllama(imageBase64: string, strict: boolean): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        // Ollama は format に JSON Schema を渡すと構造化出力を強制できる
        format: analysisJsonSchema,
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: strict ? USER_PROMPT + STRICT_NUDGE : USER_PROMPT,
            // Ollama は data URL ではなく base64 文字列のみを受け取る
            images: [imageBase64],
          },
        ],
      }),
    });
  } catch (e) {
    throw new OllamaError(
      `Ollama に接続できませんでした (${OLLAMA_HOST})。\`ollama serve\` が起動しているか確認してください。`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new OllamaError(
        `モデル "${OLLAMA_MODEL}" が見つかりません。先に \`ollama pull ${OLLAMA_MODEL}\` を実行してください。`,
      );
    }
    throw new OllamaError(`Ollama がエラーを返しました (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/** モデル出力(前置き文やコードフェンス混じりでも)から Analysis を取り出す */
function tryParse(content: string): Analysis | null {
  const json = extractJson(content);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    const result = analysisSchema.safeParse(obj);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * チャート画像(base64)をローカルの Ollama ビジョンモデルで分析し、
 * 構造化された予想結果を返す。パース失敗時は 1 回だけ厳格指示で再試行する。
 */
export async function analyzeChart(
  imageBase64: string,
  _mediaType: ImageMediaType,
): Promise<Analysis> {
  let parsed = tryParse(await callOllama(imageBase64, false));
  if (!parsed) {
    parsed = tryParse(await callOllama(imageBase64, true));
  }
  if (!parsed) {
    throw new OllamaError(
      "モデルの出力を解析できませんでした。別のモデル(環境変数 OLLAMA_MODEL)を試すか、もう一度お試しください。",
    );
  }
  return { ...parsed, scenarios: normalizeProbabilities(parsed.scenarios) };
}
