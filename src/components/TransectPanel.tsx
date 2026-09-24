import { formatFraction } from '../core/fraction';
import { TRANSECT_KIND_LABELS } from '../core/transect';
import type { TransectResult } from '../core/types';
import { polylineColor } from './ContourSvg';

export interface TransectFields {
  sr: string;
  sc: string;
  er: string;
  ec: string;
}

interface Props {
  /** 无有效描线（未生成或输入已修改）时禁用 */
  disabled: boolean;
  maxRow: number;
  maxCol: number;
  fields: TransectFields;
  error: string | null;
  /** 当前生效的穿越结果；被撤销或无结果时为 null */
  result: TransectResult | null;
  /** 存在旧穿越结果但因更换网格/阈值被撤销 */
  revoked: boolean;
  onFieldsChange: (fields: TransectFields) => void;
  onAnalyze: () => void;
  onDownload: () => void;
}

export function TransectPanel({
  disabled,
  maxRow,
  maxCol,
  fields,
  error,
  result,
  revoked,
  onFieldsChange,
  onAnalyze,
  onDownload,
}: Props) {
  const set = (patch: Partial<TransectFields>) => onFieldsChange({ ...fields, ...patch });
  return (
    <section className="panel transect-panel">
      <h2>穿越线分析</h2>
      <p className="hint">
        穿越线两端吸附网格顶点（整数行列：行 0–{maxRow}、列 0–{maxCol}
        ），逐段与等高线求精确交点；共享顶点只记一个事件，按前后位于穿越线两侧 /
        同侧 / 折线开放端点标为穿越 / 相切 / 端点接触；与任一等高线线段重合则拒绝本次分析。
      </p>
      <div className="transect-fields">
        <span className="field-group-label">起点</span>
        <label>
          行
          <input
            value={fields.sr}
            disabled={disabled}
            onChange={(e) => set({ sr: e.target.value })}
          />
        </label>
        <label>
          列
          <input
            value={fields.sc}
            disabled={disabled}
            onChange={(e) => set({ sc: e.target.value })}
          />
        </label>
        <span className="field-group-label">终点</span>
        <label>
          行
          <input
            value={fields.er}
            disabled={disabled}
            onChange={(e) => set({ er: e.target.value })}
          />
        </label>
        <label>
          列
          <input
            value={fields.ec}
            disabled={disabled}
            onChange={(e) => set({ ec: e.target.value })}
          />
        </label>
        <button className="primary" onClick={onAnalyze} disabled={disabled}>
          分析穿越线
        </button>
      </div>
      {error && (
        <div className="error">已拒绝本次分析（保留上次有效穿越结果）：{error}</div>
      )}
      {revoked && !error && (
        <div className="stale-note">网格或阈值已更换，旧穿越分析已撤销。</div>
      )}
      {result && (
        <div className="transect-result">
          <div className="stats">
            <span>事件 {result.events.length}</span>
            <span className="legend">标记：● 穿越 ◆ 相切 ■ 端点接触</span>
            <button onClick={onDownload}>下载穿越 JSON</button>
          </div>
          {result.events.length === 0 ? (
            <p className="hint">穿越线没有碰到任何等高线。</p>
          ) : (
            <div className="transect-events">
              <table className="transect-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>位置 t</th>
                    <th>行 row</th>
                    <th>列 col</th>
                    <th>折线</th>
                    <th>类型</th>
                    <th>命中</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.map((ev, i) => (
                    <tr key={i}>
                      <td>{i}</td>
                      <td>{formatFraction(ev.t)}</td>
                      <td>{formatFraction(ev.row)}</td>
                      <td>{formatFraction(ev.col)}</td>
                      <td>
                        <span
                          className="dot"
                          style={{ background: polylineColor(ev.polylineId) }}
                        />{' '}
                        #{ev.polylineId}
                      </td>
                      <td>
                        <span className={`tag ${ev.kind}`}>
                          {TRANSECT_KIND_LABELS[ev.kind]}
                        </span>
                      </td>
                      <td>
                        {ev.vertexIndex !== null
                          ? `顶点 ${ev.vertexIndex}`
                          : `线段 ${ev.segmentIndex}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
