import { formatFraction } from '../core/fraction';
import type { ContourResult } from '../core/types';
import { polylineColor } from './ContourSvg';

export function PolylineTable({ result }: { result: ContourResult }) {
  if (result.polylines.length === 0) {
    return <p className="hint">该阈值下没有任何跨阈值边，无等高线。</p>;
  }
  return (
    <div className="polyline-list">
      {result.polylines.map((p) => (
        <details key={p.id} open={result.polylines.length <= 6}>
          <summary>
            <span className="dot" style={{ background: polylineColor(p.id) }} />
            <span className="badge">#{p.id}</span>
            <span className={p.closed ? 'tag closed' : 'tag open'}>
              {p.closed ? '闭环' : '开放'}
            </span>
            <span>点数 {p.points.length}</span>
            <span>最小边标识 {p.minEdgeId}</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>边标识</th>
                <th>行 row</th>
                <th>列 col</th>
              </tr>
            </thead>
            <tbody>
              {p.points.map((pt, i) => (
                <tr key={i}>
                  <td>{i}</td>
                  <td>{pt.edgeId}</td>
                  <td>{formatFraction(pt.row)}</td>
                  <td>{formatFraction(pt.col)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
