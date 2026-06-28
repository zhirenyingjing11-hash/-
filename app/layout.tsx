import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "株チャート予想 AI",
  description:
    "株価チャートの画像をアップロードすると、出来高・テクニカル・ローソク足・投資家心理から今後の値動きシナリオを確率配分つきで提示します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
