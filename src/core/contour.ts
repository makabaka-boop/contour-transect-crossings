import { addInteger, makeFraction, type Fraction } from './fraction';
import type {
  ContourResult,
  CrossPoint,
  Crossing,
  GridInput,
  Polyline,
  Segment,
} from './types';

/**
 *  marching squares 描线：
 *  1. 逐条网格边检测跨阈值交点，以整数分数记录位置；
 *  2. 逐格按 16 种角点高低组合生成线段，四交点鞍格按四角均值消歧；
 *  3. 相邻格通过共享边标识把线段拼接成开放折线或闭环；
 *  4. 每条折线规范定向，全体按最小边标识排序，保证结果确定。
 */

// 格内局部边编号
const TOP = 0;
const RIGHT = 1;
const BOTTOM = 2;
const LEFT = 3;

// 角点掩码位：左上=8 右上=4 右下=2 左下=1
// 非鞍点情形直接给出连接关系（局部边对）
const SIMPLE_CASES: Record<number, Array<[number, number]>> = {
  0: [],
  15: [],
  1: [[LEFT, BOTTOM]], // 左下高
  2: [[BOTTOM, RIGHT]], // 右下高
  3: [[LEFT, RIGHT]], // 下排高
  4: [[TOP, RIGHT]], // 右上高
  6: [[TOP, BOTTOM]], // 右列高
  7: [[LEFT, TOP]], // 仅左上低
  8: [[LEFT, TOP]], // 左上高
  9: [[TOP, BOTTOM]], // 左列高
  11: [[TOP, RIGHT]], // 仅右上低
  12: [[LEFT, RIGHT]], // 上排高
  13: [[BOTTOM, RIGHT]], // 仅右下低
  14: [[LEFT, BOTTOM]], // 仅左下低
};

/**
 * 鞍格（掩码 5 / 10，四个交点）消歧：
 *  - 四角均值高于阈值 → 连接低角周围的交点；
 *  - 低于阈值 → 连接高角周围的交点；
 *  - 恰等 → 固定连接左上与右下角周围的交点。
 * 均值与阈值比较转化为整数比较：sum 与 2*levelTwice 比较。
 */
function saddlePairs(
  mask: number,
  cornerSum: number,
  levelTwice: number,
): Array<[number, number]> {
  const aroundTLBR: Array<[number, number]> = [
    [LEFT, TOP],
    [BOTTOM, RIGHT],
  ];
  const aroundTRBL: Array<[number, number]> = [
    [TOP, RIGHT],
    [LEFT, BOTTOM],
  ];
  const cmp = Math.sign(cornerSum - 2 * levelTwice);
  if (cmp === 0) return aroundTLBR; // 恰等：固定左上、右下
  const connectLow = cmp > 0;
  if (mask === 5) {
    // 高角：右上、左下；低角：左上、右下
    return connectLow ? aroundTLBR : aroundTRBL;
  }
  // mask === 10：高角：左上、右下；低角：右上、左下
  return connectLow ? aroundTRBL : aroundTLBR;
}

// ---- 网格边标识 ----
// 水平边 H(r,c)：顶点 (r,c)-(r,c+1)，r∈[0,rows-1]，c∈[0,cols-2]
// 竖直边 V(r,c)：顶点 (r,c)-(r+1,c)，r∈[0,rows-2]，c∈[0,cols-1]
export function horizontalEdgeCount(rows: number, cols: number): number {
  return rows * (cols - 1);
}

export function horizontalEdgeId(r: number, c: number, cols: number): number {
  return r * (cols - 1) + c;
}

export function verticalEdgeId(r: number, c: number, rows: number, cols: number): number {
  return horizontalEdgeCount(rows, cols) + r * cols + c;
}

/**
 * 端点值为 a、b 的边是否跨阈值 levelTwice/2；
 * 若是，返回从 a 到 b 的交点比例（约分后的整数分数，严格位于 (0,1)）。
 * levelTwice 为奇数 ⇒ 2v-levelTwice 恒为奇数 ≠ 0，顶点不会恰在阈值上。
 */
export function crossingFraction(a: number, b: number, levelTwice: number): Fraction | null {
  const da = 2 * a - levelTwice;
  const db = 2 * b - levelTwice;
  if (da === 0 || db === 0) return null; // 奇数 levelTwice 下不会发生，防御
  if (da < 0 === db < 0) return null;
  // t = (levelTwice/2 - a) / (b - a) = (levelTwice - 2a) / (2(b - a))
  return makeFraction(levelTwice - 2 * a, 2 * (b - a));
}

/** 对整份有效输入执行描线，产出确定性的等高线拓扑 */
export function computeContours(input: GridInput): ContourResult {
  const { grid, levelTwice } = input;
  const rows = grid.length;
  const cols = grid[0].length;

  // 1. 逐边求交点
  const crossingByEdge = new Map<number, Crossing>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const t = crossingFraction(grid[r][c], grid[r][c + 1], levelTwice);
      if (t) {
        const edgeId = horizontalEdgeId(r, c, cols);
        crossingByEdge.set(edgeId, {
          edgeId,
          t,
          row: makeFraction(r, 1),
          col: addInteger(t, c),
        });
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const t = crossingFraction(grid[r][c], grid[r + 1][c], levelTwice);
      if (t) {
        const edgeId = verticalEdgeId(r, c, rows, cols);
        crossingByEdge.set(edgeId, {
          edgeId,
          t,
          row: addInteger(t, r),
          col: makeFraction(c, 1),
        });
      }
    }
  }

  // 2. 逐格生成线段
  const segments: Segment[] = [];
  const above = (v: number) => 2 * v > levelTwice;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = grid[r][c];
      const tr = grid[r][c + 1];
      const br = grid[r + 1][c + 1];
      const bl = grid[r + 1][c];
      let mask = 0;
      if (above(tl)) mask |= 8;
      if (above(tr)) mask |= 4;
      if (above(br)) mask |= 2;
      if (above(bl)) mask |= 1;
      if (mask === 0 || mask === 15) continue;

      const edgeIds = [
        horizontalEdgeId(r, c, cols), // TOP
        verticalEdgeId(r, c + 1, rows, cols), // RIGHT
        horizontalEdgeId(r + 1, c, cols), // BOTTOM
        verticalEdgeId(r, c, rows, cols), // LEFT
      ];
      const pairs =
        mask === 5 || mask === 10
          ? saddlePairs(mask, tl + tr + br + bl, levelTwice)
          : SIMPLE_CASES[mask];
      for (const [e1, e2] of pairs) {
        segments.push({ cellRow: r, cellCol: c, edgeA: edgeIds[e1], edgeB: edgeIds[e2] });
      }
    }
  }

  // 3+4. 拼接、规范化、排序
  const polylines = assemblePolylines(segments, crossingByEdge);
  return {
    rows,
    cols,
    levelTwice,
    crossings: [...crossingByEdge.values()].sort((a, b) => a.edgeId - b.edgeId),
    segments,
    polylines,
  };
}

interface RawChain {
  edges: number[];
  closed: boolean;
}

function assemblePolylines(
  segments: Segment[],
  crossingByEdge: Map<number, Crossing>,
): Polyline[] {
  // 邻接表：边标识 → 以该边为端点的线段。每条边至多被两个相邻格使用，
  // 因此每个节点度数 ≤ 2，连通分量只能是开放路径或闭环。
  const adj = new Map<number, Array<{ seg: number; other: number }>>();
  segments.forEach((s, i) => {
    for (const [from, to] of [
      [s.edgeA, s.edgeB],
      [s.edgeB, s.edgeA],
    ] as const) {
      const list = adj.get(from);
      if (list) list.push({ seg: i, other: to });
      else adj.set(from, [{ seg: i, other: to }]);
    }
  });

  const visited = new Array<boolean>(segments.length).fill(false);
  const chains: RawChain[] = [];

  const walk = (startEdge: number): number[] => {
    const chain = [startEdge];
    let current = startEdge;
    for (;;) {
      const next = (adj.get(current) ?? []).find((e) => !visited[e.seg]);
      if (!next) break;
      visited[next.seg] = true;
      chain.push(next.other);
      current = next.other;
    }
    return chain;
  };

  // 开放折线：从度为 1 的端点（边界跨阈值边）出发
  const endpoints = [...adj.entries()]
    .filter(([, list]) => list.length === 1)
    .map(([edgeId]) => edgeId)
    .sort((a, b) => a - b);
  for (const e of endpoints) {
    const list = adj.get(e);
    if (!list || visited[list[0].seg]) continue;
    chains.push({ edges: walk(e), closed: false });
  }

  // 闭环：剩余未访问线段构成环，按线段生成顺序出发
  segments.forEach((s, i) => {
    if (visited[i]) return;
    const chain = walk(s.edgeA);
    chain.pop(); // 走回起点，去掉末尾重复
    chains.push({ edges: chain, closed: true });
  });

  const toPoint = (edgeId: number): CrossPoint => {
    const c = crossingByEdge.get(edgeId);
    if (!c) throw new Error(`内部错误：边 ${edgeId} 缺少交点记录`);
    return { edgeId, row: c.row, col: c.col };
  };

  return chains
    .map(({ edges, closed }) => {
      const canon = canonicalize(edges, closed);
      return {
        closed,
        minEdgeId: Math.min(...canon),
        points: canon.map(toPoint),
      };
    })
    .sort((a, b) => a.minEdgeId - b.minEdgeId)
    .map((p, i) => ({ id: i, ...p }));
}

/**
 * 规范定向，保证结果确定：
 *  - 开放折线：从边标识较小的端点出发；
 *  - 闭环：旋转到最小边标识为首点，并令其第二个点边标识小于末点。
 */
function canonicalize(chain: number[], closed: boolean): number[] {
  if (chain.length < 2) return chain;
  if (!closed) {
    if (chain[0] > chain[chain.length - 1]) chain.reverse();
    return chain;
  }
  let minIdx = 0;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i] < chain[minIdx]) minIdx = i;
  }
  const rotated = [...chain.slice(minIdx), ...chain.slice(0, minIdx)];
  if (rotated.length > 2 && rotated[1] > rotated[rotated.length - 1]) {
    rotated.reverse();
    const min = rotated.pop() as number;
    rotated.unshift(min);
  }
  return rotated;
}
