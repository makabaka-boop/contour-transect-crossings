import { useState } from 'react';
import { ContourSvg } from './components/ContourSvg';
import { InputPanel } from './components/InputPanel';
import { PolylineTable } from './components/PolylineTable';
import { TransectPanel, type TransectFields } from './components/TransectPanel';
import { computeContours } from './core/contour';
import { parseGridInput } from './core/parse';
import { analyzeTransect, validateTransectEndpoints } from './core/transect';
import type { ContourResult, GridInput, TransectResult } from './core/types';

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

/** 穿越结果只对生成它的那份描线有效，用输入文本标识 */
interface TransectState {
  forText: string;
  result: TransectResult;
}

function applyText(text: string): Applied | null {
  const parsed = parseGridInput(text);
  if (!parsed.ok) return null;
  return { text, input: parsed.value, result: computeContours(parsed.value) };
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [applied, setApplied] = useState<Applied | null>(() => applyText(SAMPLE));
  const [error, setError] = useState<string | null>(null);
  const [transectFields, setTransectFields] = useState<TransectFields>({
    sr: '0',
    sc: '0',
    er: '5',
    ec: '5',
  });
  const [transect, setTransect] = useState<TransectState | null>(null);
  const [transectError, setTransectError] = useState<string | null>(null);

  // 编辑立即撤销旧描线：文本与上次成功应用不一致即为过期
  const stale = applied !== null && text !== applied.text;

  // 更换网格或阈值（输入失效）立即撤销旧穿越分析
  const transectActive =
    applied !== null && !stale && transect !== null && transect.forText === applied.text;
  const activeTransect = transectActive ? transect.result : null;
  const transectRevoked = transect !== null && !transectActive;

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
    setTransectError(null); // 网格/阈值变动：旧穿越分析连同其错误一并撤销
  };

  const handleDownload = () => {
    if (!applied || stale) return;
    downloadJson(`contours-levelTwice-${applied.result.levelTwice}.json`, applied.result);
  };

  const handleAnalyzeTransect = () => {
    if (!applied || stale) return;
    const { rows, cols } = applied.result;
    const endpoints = validateTransectEndpoints(
      rows,
      cols,
      transectFields.sr,
      transectFields.sc,
      transectFields.er,
      transectFields.ec,
    );
    if (!endpoints.ok) {
      // 端点不合法：拒绝本次分析，保留上次有效穿越结果
      setTransectError(endpoints.error);
      return;
    }
    const analysis = analyzeTransect(applied.result, endpoints.line);
    if (!analysis.ok) {
      // 与等高线线段重合：拒绝本次分析，保留上次有效穿越结果
      setTransectError(analysis.error);
      return;
    }
    setTransectError(null);
    setTransect({ forText: applied.text, result: analysis.result });
  };

  const handleTransectDownload = () => {
    if (!applied || !activeTransect) return;
    downloadJson(`transect-levelTwice-${applied.result.levelTwice}.json`, activeTransect);
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
              <ContourSvg
                input={applied.input}
                result={applied.result}
                transect={activeTransect}
              />
              <PolylineTable result={applied.result} />
            </>
          )}
          <TransectPanel
            disabled={!applied || stale}
            maxRow={applied ? applied.result.rows - 1 : 0}
            maxCol={applied ? applied.result.cols - 1 : 0}
            fields={transectFields}
            error={transectError}
            result={activeTransect}
            revoked={transectRevoked}
            onFieldsChange={setTransectFields}
            onAnalyze={handleAnalyzeTransect}
            onDownload={handleTransectDownload}
          />
        </section>
      </main>
    </div>
  );
}
