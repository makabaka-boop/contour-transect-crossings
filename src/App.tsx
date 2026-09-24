import { useState } from 'react';
import { ContourSvg } from './components/ContourSvg';
import { InputPanel } from './components/InputPanel';
import { PolylineTable } from './components/PolylineTable';
import { computeContours } from './core/contour';
import { parseGridInput } from './core/parse';
import type { ContourResult, GridInput } from './core/types';

const SAMPLE = `{
  "grid": [
    [0, 0, 0, 0, 0, 0],
    [0, 4, 0, 0, 4, 0],
    [0, 0, 2, 2, 0, 0],
    [0, 0, 2, 2, 0, 0],
    [0, 4, 0, 0, 4, 0],
    [0, 0, 0, 0, 0, 0]
  ],
  "levelTwice": 3
}`;

interface Applied {
  text: string;
  input: GridInput;
  result: ContourResult;
}

function applyText(text: string): Applied | null {
  const parsed = parseGridInput(text);
  if (!parsed.ok) return null;
  return { text, input: parsed.value, result: computeContours(parsed.value) };
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [applied, setApplied] = useState<Applied | null>(() => applyText(SAMPLE));
  const [error, setError] = useState<string | null>(null);

  // 编辑立即撤销旧描线：文本与上次成功应用不一致即为过期
  const stale = applied !== null && text !== applied.text;

  const handleApply = () => {
    const parsed = parseGridInput(text);
    if (!parsed.ok) {
      // 拒绝整份输入，保留上次有效网格
      setError(parsed.error);
      return;
    }
    setError(null);
    setApplied({ text, input: parsed.value, result: computeContours(parsed.value) });
  };

  const handleChange = (next: string) => {
    setText(next);
    setError(null);
  };

  const handleDownload = () => {
    if (!applied || stale) return;
    const blob = new Blob([JSON.stringify(applied.result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contours-levelTwice-${applied.result.levelTwice}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = applied && !stale ? applied.result : null;
  const closedCount = stats ? stats.polylines.filter((p) => p.closed).length : 0;

  return (
    <div className="app">
      <header>
        <h1>等高线描线工作台</h1>
        <span className="subtitle">marching squares · 整数分数交点 · 确定性拓扑</span>
      </header>
      <main>
        <InputPanel
          text={text}
          error={error}
          stale={stale}
          onChange={handleChange}
          onApply={handleApply}
          onLoadSample={() => handleChange(SAMPLE)}
        />
        <section className="panel result-panel">
          <div className="result-header">
            <h2>描线结果</h2>
            {stats && (
              <div className="stats">
                <span>
                  阈值 {stats.levelTwice}/2
                </span>
                <span>交点 {stats.crossings.length}</span>
                <span>线段 {stats.segments.length}</span>
                <span>
                  折线 {stats.polylines.length}（闭环 {closedCount} / 开放{' '}
                  {stats.polylines.length - closedCount}）
                </span>
                <button onClick={handleDownload}>下载 JSON</button>
              </div>
            )}
          </div>
          {!applied && (
            <div className="placeholder">尚无有效网格：请在左侧输入并点击「生成等高线」。</div>
          )}
          {applied && stale && (
            <div className="placeholder stale">
              输入已修改，原有描线已撤销。点击「生成等高线」重新计算。
            </div>
          )}
          {applied && !stale && (
            <>
              <ContourSvg input={applied.input} result={applied.result} />
              <PolylineTable result={applied.result} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
