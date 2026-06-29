import { NextResponse } from "next/server";
import { analyzeChart, type ImageMediaType } from "@/lib/ollama";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES: ImageMediaType[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageBase64, mediaType } = body as {
      imageBase64?: string;
      mediaType?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "imageBase64 が必要です。" },
        { status: 400 },
      );
    }
    if (!mediaType || !ALLOWED_TYPES.includes(mediaType as ImageMediaType)) {
      return NextResponse.json(
        { error: "対応している画像形式は PNG / JPEG / GIF / WebP です。" },
        { status: 400 },
      );
    }

    const analysis = await analyzeChart(imageBase64, mediaType as ImageMediaType);
    return NextResponse.json(analysis);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "分析中に予期しないエラーが発生しました。";
    // API キー未設定などはサーバーログにも残す
    console.error("[/api/analyze]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
