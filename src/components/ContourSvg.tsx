import { fractionToNumber } from '../core/fraction';
import type { ContourResult, GridInput, TraverseResult, TraverseKind } from '../core/types';

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

export const TRAVERSE_META: Record<TraverseKind, { label: string; color: string; symbol: string }> = {
  cross: { label: '穿越', color: '#0a7a3b', symbol: '●' },
  tangent: { label: '相切', color: '#b45309', symbol: '◆' },
  endpoint: { label: '端点接触', color: '#6f42c1', symbol: '▲' },
};

interface Props {
  input: GridInput;
  result: ContourResult;
  traverse: TraverseResult | null;
  /** 已吸附但尚未完成分析的端点（最多两个） */
  draftVerts: Array<{ row: number; col: number }>;
  onVertexClick?: (row: number, col: number) => void;
}

export function ContourSvg({ input, result, traverse, draftVerts, onVertexClick }: Props) {
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
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      vertices.push(
        <circle
          key={`hit-${r}-${c}`}
          cx={X(c)}
          cy={Y(r)}
          r={Math.max(6, cell * 0.22)}
          fill="transparent"
          style={{ cursor: onVertexClick ? 'pointer' : 'default' }}
          onClick={onVertexClick ? () => onVertexClick(r, c) : undefined}
        >
          <title>{`吸附顶点 (${r}, ${c})`}</title>
        </circle>,
      );
      if (showLabels) {
        vertices.push(
          <text
            key={`label-${r}-${c}`}
            x={X(c)}
            y={Y(r) - 4}
            fontSize={11}
            textAnchor="middle"
            fill="#9aa0a6"
            pointerEvents="none"
          >
            {input.grid[r][c]}
          </text>,
        );
      }
    }
  }

  const draftLine =
    draftVerts.length === 2 ? (
      <line
        x1={X(draftVerts[0].col)}
        y1={Y(draftVerts[0].row)}
        x2={X(draftVerts[1].col)}
        y2={Y(draftVerts[1].row)}
        stroke="#1f6feb"
        strokeWidth={1.6}
        strokeDasharray="6 4"
        pointerEvents="none"
      />
    ) : null;

  const traverseLine = traverse ? (
    <line
      x1={X(traverse.startCol)}
      y1={Y(traverse.startRow)}
      x2={X(traverse.endCol)}
      y2={Y(traverse.endRow)}
      stroke="#1f6feb"
      strokeWidth={2.2}
      strokeLinecap="round"
      pointerEvents="none"
    />
  ) : null;

  const traverseEndpoints = traverse
    ? [
        { row: traverse.startRow, col: traverse.startCol },
        { row: traverse.endRow, col: traverse.endCol },
      ].map((v, i) => (
        <rect
          key={`t-end-${i}`}
          x={X(v.col) - 4.5}
          y={Y(v.row) - 4.5}
          width={9}
          height={9}
          fill="#1f6feb"
          stroke="#fff"
          strokeWidth={1.2}
          pointerEvents="none"
        />
      ))
    : null;

  const draftMarkers = draftVerts.map((v, i) => (
    <rect
      key={`draft-${i}`}
      x={X(v.col) - 4.5}
      y={Y(v.row) - 4.5}
      width={9}
      height={9}
      fill="none"
      stroke="#1f6feb"
      strokeWidth={1.8}
      pointerEvents="none"
    />
  ));

  return (
    <div className="svg-scroll">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="等高线与穿越线"
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
              pointerEvents="none"
            >
              <title>{`边 ${pt.edgeId}`}</title>
            </circle>
          )),
        )}
        {draftLine}
        {traverseLine}
        {draftMarkers}
        {traverseEndpoints}
        {traverse?.events.map((ev, i) => {
          const meta = TRAVERSE_META[ev.kind];
          const cx = X(fractionToNumber(ev.col));
          const cy = Y(fractionToNumber(ev.row));
          return (
            <g key={`event-${i}`} pointerEvents="none">
              {ev.kind === 'cross' && (
                <circle cx={cx} cy={cy} r={5.5} fill={meta.color} stroke="#fff" strokeWidth={1.4} />
              )}
              {ev.kind === 'tangent' && (
                <rect
                  x={cx - 5}
                  y={cy - 5}
                  width={10}
                  height={10}
                  transform={`rotate(45 ${cx} ${cy})`}
                  fill={meta.color}
                  stroke="#fff"
                  strokeWidth={1.4}
                />
              )}
              {ev.kind === 'endpoint' && (
                <path
                  d={`M ${cx} ${cy - 6} L ${cx + 5.5} ${cy + 4} L ${cx - 5.5} ${cy + 4} Z`}
                  fill={meta.color}
                  stroke="#fff"
                  strokeWidth={1.2}
                />
              )}
              <title>{`${meta.label} · 折线 #${ev.polylineId} · s=${ev.s.num}/${ev.s.den}${
                ev.edgeId !== null ? ` · 边 ${ev.edgeId}` : ''
              }`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
