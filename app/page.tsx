"use client";

import { useCallback, useRef, useState } from "react";
import type { Analysis, Direction, Scenario } from "@/lib/schema";

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const DIR_LABEL: Record<Direction, string> = {
  up: "上昇",
  down: "下落",
  sideways: "横ばい",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("PNG / JPEG / GIF / WebP 形式の画像を選択してください。");
      return;
    }
    const url = await readAsDataUrl(file);
    setDataUrl(url);
    setMediaType(file.type);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const analyze = useCallback(async () => {
    if (!dataUrl || !mediaType) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // data URL から base64 部分のみ取り出す
      const base64 = dataUrl.split(",")[1];
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "分析に失敗しました。");
      }
      setResult(json as Analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [dataUrl, mediaType]);

  return (
    <div className="container">
      <header>
        <h1>📈 株チャート予想 AI</h1>
        <p className="lead">
          株価チャートの画像をアップロードすると、出来高・テクニカル分析・ローソク足のサイン・投資家心理から、
          今後の値動きを複数シナリオ＋確率配分で予想します。
        </p>
      </header>

      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p style={{ margin: 0 }}>
          ここにチャート画像をドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="meta" style={{ margin: "6px 0 0" }}>
          PNG / JPEG / GIF / WebP
        </p>
      </div>

      {dataUrl && (
        <div className="preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt="アップロードしたチャート" />
        </div>
      )}

      <div className="actions">
        <button
          className="primary"
          onClick={analyze}
          disabled={!dataUrl || loading}
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? "分析中…" : "予想する"}
        </button>
        {dataUrl && !loading && (
          <button
            onClick={() => {
              setDataUrl(null);
              setMediaType(null);
              setResult(null);
              setError(null);
            }}
          >
            クリア
          </button>
        )}
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {result && <Results analysis={result} />}
    </div>
  );
}

function Results({ analysis }: { analysis: Analysis }) {
  return (
    <div className="results">
      <section className="card">
        <h2>想定シナリオと確率配分</h2>
        {analysis.scenarios.map((s, i) => (
          <ScenarioCard key={i} scenario={s} />
        ))}
      </section>

      <section className="card">
        <h2>検出されたシグナル</h2>
        <p className="meta" style={{ margin: "0 0 4px" }}>
          時間軸の推測: {analysis.timeframe}
          {analysis.symbol_guess ? `／銘柄推測: ${analysis.symbol_guess}` : ""}
        </p>
        <p style={{ margin: "12px 0 4px", fontWeight: 700 }}>ローソク足のサイン</p>
        <div className="tag-list">
          {analysis.detected_signals.candlestick_patterns.length > 0 ? (
            analysis.detected_signals.candlestick_patterns.map((p, i) => (
              <span className="tag" key={i}>
                {p}
              </span>
            ))
          ) : (
            <span className="meta">明確なパターンは検出されませんでした</span>
          )}
        </div>

        <p style={{ margin: "16px 0 4px", fontWeight: 700 }}>テクニカル指標</p>
        <div className="tag-list">
          {analysis.detected_signals.technical_indicators.length > 0 ? (
            analysis.detected_signals.technical_indicators.map((t, i) => (
              <span className="tag" key={i}>
                {t}
              </span>
            ))
          ) : (
            <span className="meta">読み取れる指標はありませんでした</span>
          )}
        </div>

        <p style={{ margin: "16px 0 4px", fontWeight: 700 }}>出来高の所見</p>
        <p style={{ margin: 0 }}>{analysis.detected_signals.volume_analysis}</p>
      </section>

      <section className="card">
        <h2>投資家心理</h2>
        <p style={{ margin: 0 }}>{analysis.investor_psychology}</p>
      </section>

      <p className="disclaimer">{analysis.disclaimer}</p>
    </div>
  );
}

function ScenarioCard({ scenario: s }: { scenario: Scenario }) {
  return (
    <div className="scenario">
      <div className="scenario-head">
        <div className="scenario-title">
          <span>{s.label}</span>
          <span className={`dir-badge dir-${s.direction}`}>
            {DIR_LABEL[s.direction]}
          </span>
        </div>
        <span className="prob">{s.probability}%</span>
      </div>
      <div className="bar">
        <span
          className={s.direction}
          style={{ width: `${Math.max(0, Math.min(100, s.probability))}%` }}
        />
      </div>
      <p className="expected">想定値動き: {s.expected_move}</p>
      <p style={{ margin: 0 }}>{s.rationale}</p>
    </div>
  );
}
