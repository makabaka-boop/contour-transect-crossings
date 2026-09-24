import { useState } from 'react';
import { ContourSvg } from './components/ContourSvg';
import { InputPanel } from './components/InputPanel';
import { PolylineTable } from './components/PolylineTable';
import { TraverseTable } from './components/TraverseTable';
import { computeContours } from './core/contour';
import { parseGridInput } from './core/parse';
import { analyzeTraverse } from './core/traverse';
import type { ContourResult, GridInput, TraverseResult } from './core/types';

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

  // 穿越线：draftVerts 为已吸附未完成的端点（0–2 个）；
  // traverse 为上次有效分析。更换网格/阈值或文本变过期时整体撤销。
  const [draftVerts, setDraftVerts] = useState<Array<{ row: number; col: number }>>([]);
  const [traverse, setTraverse] = useState<TraverseResult | null>(null);
  const [traverseError, setTraverseError] = useState<string | null>(null);

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
    // 更换网格或阈值立即撤销旧穿越分析
    setDraftVerts([]);
    setTraverse(null);
    setTraverseError(null);
  };

  const handleChange = (next: string) => {
    setText(next);
    setError(null);
  };

  const handleVertexClick = (row: number, col: number) => {
    if (!applied || stale) return;
    setTraverseError(null);
    // 已选起点时再次点击同一点：重选起点
    if (
      draftVerts.length === 1 &&
      draftVerts[0].row === row &&
      draftVerts[0].col === col
    ) {
      return;
    }
    if (draftVerts.length === 0) {
      setDraftVerts([{ row, col }]);
      return;
    }
    const a = draftVerts[0];
    const outcome = analyzeTraverse(
      applied.input,
      applied.result,
      a.row,
      a.col,
      row,
      col,
    );
    setDraftVerts([]);
    if (outcome.ok) {
      // 同一事件数组驱动 SVG、明细表与下载 JSON
      setTraverse(outcome.result);
    } else {
      // 重合或非法：拒绝本次分析，保留上次有效穿越结果
      setTraverseError(outcome.error);
    }
  };

  const handleClearTraverse = () => {
    setDraftVerts([]);
    setTraverse(null);
    setTraverseError(null);
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

  const handleDownloadTraverse = () => {
    if (!applied || stale || !traverse) return;
    const payload = {
      levelTwice: applied.result.levelTwice,
      startRow: traverse.startRow,
      startCol: traverse.startCol,
      endRow: traverse.endRow,
      endCol: traverse.endCol,
      events: traverse.events,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traverse-${traverse.startRow}-${traverse.startCol}-to-${traverse.endRow}-${traverse.endCol}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = applied && !stale ? applied.result : null;
  const closedCount = stats ? stats.polylines.filter((p) => p.closed).length : 0;

  return (
    <div className="app">
      <header>
        <h1>等高线描线工作台</h1>
        <span className="subtitle">marching squares · 整数分数交点 · 确定性拓扑 · 穿越线精确分析</span>
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
              输入已修改，原有描线与穿越分析已撤销。点击「生成等高线」重新计算。
            </div>
          )}
          {applied && !stale && (
            <>
              <div className="traverse-toolbar">
                <span className="hint">
                  在 SVG 上依次点击两个网格顶点画穿越线（自动吸附）；重复点击同一点可重选起点。
                  {draftVerts.length === 1 &&
                    ` 已选起点 (${draftVerts[0].row}, ${draftVerts[0].col})，再点一个顶点。`}
                </span>
                <div className="button-row">
                  <button onClick={handleClearTraverse}>清除穿越线</button>
                  <button
                    onClick={handleDownloadTraverse}
                    disabled={!traverse}
                    title={traverse ? '下载穿越分析 JSON' : '尚无有效穿越分析'}
                  >
                    下载穿越 JSON
                  </button>
                </div>
              </div>
              {traverseError && <div className="error">已拒绝本次穿越分析：{traverseError}</div>}
              <ContourSvg
                input={applied.input}
                result={applied.result}
                traverse={traverse}
                draftVerts={draftVerts}
                onVertexClick={handleVertexClick}
              />
              {traverse && <TraverseTable traverse={traverse} />}
              <PolylineTable result={applied.result} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
