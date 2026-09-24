import { fractionToNumber } from '../core/fraction';
import type { ContourResult, GridInput } from '../core/types';

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
}

export function ContourSvg({ input, result }: Props) {
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
      </svg>
    </div>
  );
}
