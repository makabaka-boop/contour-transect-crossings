import { formatFraction } from '../core/fraction';
import type { TraverseResult } from '../core/types';
import { TRAVERSE_META } from './ContourSvg';

export function TraverseTable({ traverse }: { traverse: TraverseResult }) {
  const line = `(${traverse.startRow}, ${traverse.startCol}) → (${traverse.endRow}, ${traverse.endCol})`;
  const counts = (['cross', 'tangent', 'endpoint'] as const).map((k) => ({
    k,
    n: traverse.events.filter((e) => e.kind === k).length,
  }));

  return (
    <div className="traverse-block">
      <div className="traverse-head">
        <h3>穿越线分析</h3>
        <span className="traverse-line-text">{line}</span>
        <span className="traverse-legend">
          {counts.map(({ k, n }) => (
            <span key={k} className="legend-item">
              <span className="mark" style={{ color: TRAVERSE_META[k].color }}>
                {TRAVERSE_META[k].symbol}
              </span>
              {TRAVERSE_META[k].label} {n}
            </span>
          ))}
        </span>
      </div>
      {traverse.events.length === 0 ? (
        <p className="hint">该穿越线与所有等高线均无交点。</p>
      ) : (
        <table className="traverse-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>类型</th>
              <th>沿穿越线 s</th>
              <th>行 row</th>
              <th>列 col</th>
              <th>折线 #</th>
              <th>顶点边标识</th>
            </tr>
          </thead>
          <tbody>
            {traverse.events.map((ev, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <span className="kind" style={{ color: TRAVERSE_META[ev.kind].color }}>
                    {TRAVERSE_META[ev.kind].symbol} {TRAVERSE_META[ev.kind].label}
                  </span>
                </td>
                <td>{formatFraction(ev.s)}</td>
                <td>{formatFraction(ev.row)}</td>
                <td>{formatFraction(ev.col)}</td>
                <td>{ev.polylineId}</td>
                <td>{ev.edgeId === null ? '—（线段内部）' : ev.edgeId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
