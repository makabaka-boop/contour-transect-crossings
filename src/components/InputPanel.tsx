interface Props {
  text: string;
  error: string | null;
  stale: boolean;
  onChange: (text: string) => void;
  onApply: () => void;
  onLoadSample: () => void;
}

export function InputPanel({ text, error, stale, onChange, onApply, onLoadSample }: Props) {
  return (
    <section className="panel input-panel">
      <h2>输入</h2>
      <p className="hint">
        JSON 对象，仅含 <code>grid</code>（2–60 行 × 2–60 列整数）与{' '}
        <code>levelTwice</code>（奇数整数，阈值 = levelTwice/2）。
      </p>
      <textarea
        spellCheck={false}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
      />
      <div className="button-row">
        <button className="primary" onClick={onApply}>
          生成等高线
        </button>
        <button onClick={onLoadSample}>载入示例</button>
      </div>
      {error && <div className="error">已拒绝整份输入（保留上次有效网格）：{error}</div>}
      {stale && !error && <div className="stale-note">输入已修改，原描线已撤销。</div>}
    </section>
  );
}
