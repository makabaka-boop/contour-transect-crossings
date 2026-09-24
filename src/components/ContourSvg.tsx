import { formatFraction, fractionToNumber } from '../core/fraction';
import { TRANSECT_KIND_LABELS } from '../core/transect';
import type { ContourResult, GridInput, TransectResult } from '../core/types';

const PALETTE = [
  '#d62728',
  '#1f77b4',
  '#2ca02c',
  '#ff7f0e',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#17becf',
  '#bcbd22',
  '#7f7f7f',
];

export function polylineColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

interface Props {
  input: GridInput;
  result: ContourResult;
  /** 当前生效的穿越分析；无或被撤销时不绘制 */
  transect?: TransectResult | null;
}

export function ContourSvg({ input, result, transect = null }: Props) {
  const { rows, cols } = result;
  const span = Math.max(rows - 1, cols - 1);
  const cell = Math.max(14, Math.min(48, Math.floor(880 / span)));
  const pad = Math.max(24, cell * 0.7);
  const width = (cols - 1) * cell + pad * 2;
  const height = (rows - 1) * cell + pad * 2;
  const showLabels = cell >= 26;

  const X = (col: number) => pad + col * cell;
  const Y = (row: number) => pad + row * cell;

  const cells = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={X(c)}
          y={Y(r)}
          width={cell}
          height={cell}
          fill="none"
          stroke="#e3e6ea"
          strokeWidth={1}
        />,
      );
    }
  }

  const vertices = [];
  if (showLabels) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push(
          <text
            key={`${r}-${c}`}
            x={X(c)}
            y={Y(r) - 4}
            fontSize={11}
            textAnchor="middle"
            fill="#9aa0a6"
          >
            {input.grid[r][c]}
          </text>,
        );
      }
    }
  }

  return (
    <div className="svg-scroll">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="等高线"
      >
        {cells}
        {vertices}
        {result.polylines.map((p) => {
          const pts = p.points
            .map((pt) => `${X(fractionToNumber(pt.col))},${Y(fractionToNumber(pt.row))}`)
            .join(' ');
          const color = polylineColor(p.id);
          return p.closed ? (
            <polygon
              key={p.id}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
          ) : (
            <polyline
              key={p.id}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {result.polylines.flatMap((p) =>
          p.points.map((pt, i) => (
            <circle
              key={`${p.id}-${i}`}
              cx={X(fractionToNumber(pt.col))}
              cy={Y(fractionToNumber(pt.row))}
              r={3}
              fill={polylineColor(p.id)}
              stroke="#fff"
              strokeWidth={1}
            >
              <title>{`边 ${pt.edgeId}`}</title>
            </circle>
          )),
        )}
        {transect && (
          <g aria-label="穿越线">
            <line
              x1={X(fractionToNumber(transect.line.start.col))}
              y1={Y(fractionToNumber(transect.line.start.row))}
              x2={X(fractionToNumber(transect.line.end.col))}
              y2={Y(fractionToNumber(transect.line.end.row))}
              stroke="#24292f"
              strokeWidth={1.6}
              strokeDasharray="7 4"
            />
            {[transect.line.start, transect.line.end].map((p, i) => (
              <circle
                key={i}
                cx={X(fractionToNumber(p.col))}
                cy={Y(fractionToNumber(p.row))}
                r={4}
                fill="#24292f"
                stroke="#fff"
                strokeWidth={1.2}
              >
                <title>{i === 0 ? '穿越线起点' : '穿越线终点'}</title>
              </circle>
            ))}
            {transect.events.map((ev, i) => {
              const cx = X(fractionToNumber(ev.col));
              const cy = Y(fractionToNumber(ev.row));
              const label = `#${i} t=${formatFraction(ev.t)} 折线#${ev.polylineId} ${
                TRANSECT_KIND_LABELS[ev.kind]
              }`;
              if (ev.kind === 'crossing') {
                return (
                  <circle key={i} cx={cx} cy={cy} r={5} fill="#cf222e" stroke="#fff" strokeWidth={1.5}>
                    <title>{label}</title>
                  </circle>
                );
              }
              if (ev.kind === 'tangent') {
                return (
                  <polygon
                    key={i}
                    points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`}
                    fill="#bf8700"
                    stroke="#fff"
                    strokeWidth={1.5}
                  >
                    <title>{label}</title>
                  </polygon>
                );
              }
              return (
                <rect
                  key={i}
                  x={cx - 4.5}
                  y={cy - 4.5}
                  width={9}
                  height={9}
                  fill="#8250df"
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  <title>{label}</title>
                </rect>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
