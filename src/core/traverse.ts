import type {
  ContourResult,
  GridInput,
  Polyline,
  TraverseEvent,
  TraverseKind,
  TraverseResult,
} from './types';
import { makeFraction, type Fraction } from './fraction';

/**
 * 穿越线分析：两端吸附网格顶点的穿越线，逐段与已规范化的等高线折线
 * 求**精确**交点（全程 BigInt 有理数，无浮点）。
 *
 * 分类：交点前后折线位于穿越线两侧 → 穿越（cross）；同侧 → 相切（tangent）；
 * 命中开放折线端点（只有一段邻居）→ 端点接触（endpoint）。
 * 同一折线在共享顶点同时命中两段时合并为一个事件。
 * 若穿越线与任一折线线段存在**正长度重合**，明确拒绝本次分析
 * （调用方负责保留上次有效结果），绝不挑一个重合端点充数。
 */

// ---- 内部精确有理数：[分子, 分母]，分母恒为正（不预先约分，比较时交叉相乘）----
type Q = readonly [bigint, bigint];

const ZERO: Q = [0n, 1n];
const ONE: Q = [1n, 1n];

const qnum = (n: bigint | number): Q => [BigInt(n), 1n];
// 统一把分母归一为正，保证后续符号/比较无需额外判断
const norm = (n: bigint, d: bigint): Q => (d < 0n ? [-n, -d] : [n, d]);
const qadd = (a: Q, b: Q): Q => norm(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const qsub = (a: Q, b: Q): Q => norm(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const qmul = (a: Q, b: Q): Q => norm(a[0] * b[0], a[1] * b[1]);
const qdiv = (a: Q, b: Q): Q => norm(a[0] * b[1], a[1] * b[0]);

/** 有理数符号 */
const qsign = (a: Q): number => (a[0] === 0n ? 0 : a[0] < 0n === a[1] < 0n ? 1 : -1);

/** a < b（分母恒正，直接交叉相乘） */
const qlt = (a: Q, b: Q): boolean => a[0] * b[1] < b[0] * a[1];
const qle = (a: Q, b: Q): boolean => a[0] * b[1] <= b[0] * a[1];
const qeq = (a: Q, b: Q): boolean => a[0] * b[1] === b[0] * a[1];
const qmin = (a: Q, b: Q): Q => (qlt(a, b) ? a : b);
const qmax = (a: Q, b: Q): Q => (qlt(a, b) ? b : a);

function bgcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

/** 约分并转成分数（分子分母超出安全整数时拒绝，避免输出失去精确性） */
function toFraction(a: Q): Fraction {
  let n = a[0];
  let d = a[1];
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d);
  const rn = n / g;
  const rd = d / g;
  if (
    rn > BigInt(Number.MAX_SAFE_INTEGER) ||
    rn < BigInt(-Number.MAX_SAFE_INTEGER) ||
    rd > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error('穿越分析结果超出精确整数可表示范围');
  }
  return makeFraction(Number(rn), Number(rd));
}

// ---- 精确点（行、列均为有理数）----
interface RPoint {
  row: Q;
  col: Q;
}

const pSub = (a: RPoint, b: RPoint): { row: Q; col: Q } => ({
  row: qsub(a.row, b.row),
  col: qsub(a.col, b.col),
});

/** 二维向量叉积 u×v（约定坐标分量为 (row, col)） */
const cross = (
  u: { row: Q; col: Q },
  v: { row: Q; col: Q },
): Q => qsub(qmul(u.row, v.col), qmul(u.col, v.row));

/** 校验穿越线端点：必须是网格内两个不同的整数顶点 */
export function validateTraverse(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  input: GridInput,
): { ok: true } | { ok: false; error: string } {
  const verts = [startRow, startCol, endRow, endCol];
  if (verts.some((v) => !Number.isInteger(v))) {
    return { ok: false, error: '穿越线端点必须吸附到整数网格顶点' };
  }
  const rows = input.grid.length;
  const cols = input.grid[0].length;
  const inside = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  if (!inside(startRow, startCol) || !inside(endRow, endCol)) {
    return { ok: false, error: `穿越线端点必须位于网格内（行 0–${rows - 1}，列 0–${cols - 1}）` };
  }
  if (startRow === endRow && startCol === endCol) {
    return { ok: false, error: '穿越线两端必须是不同的网格顶点' };
  }
  return { ok: true };
}

type AnalyzeOutcome =
  | { ok: true; result: TraverseResult }
  | { ok: false; error: string };

/** 线段相交判定的原始命中（穿越线段 [A,B] 与折线线段 [P0,P1]） */
interface RawHit {
  /** 沿穿越线的参数位置 */
  s: Q;
  /** 沿折线线段的参数位置 */
  u: Q;
  point: RPoint;
  /** 折线线段下标（points[i]→points[i+1]，闭环额外包含末点→首点） */
  segIndex: number;
}

/** point = base + t·dir（分母通分，全程精确） */
const along = (base: Q, dir: Q, t: Q): Q => qadd(base, qmul(dir, t));

function makeHit(
  A: RPoint,
  d: { row: Q; col: Q },
  s: Q,
  u: Q,
  segIndex: number,
): RawHit {
  return {
    s,
    u,
    point: { row: along(A.row, d.row, s), col: along(A.col, d.col, s) },
    segIndex,
  };
}

/**
 * 两线段精确相交：
 *  - 'overlap'：共线且存在正长度重叠（重合，整次分析必须拒绝）；
 *  - hits：0–2 个孤立交点（含恰在端点 / 共线仅一点相接），带精确参数 (s, u)。
 */
function intersectSegments(
  A: RPoint,
  B: RPoint,
  P0: RPoint,
  P1: RPoint,
  segIndex: number,
): { kind: 'overlap' } | { kind: 'points'; hits: RawHit[] } {
  const d = pSub(B, A); // 穿越线方向
  const e = pSub(P1, P0); // 折线线段方向
  const w = pSub(P0, A);
  const den = cross(d, e);

  if (qsign(den) !== 0) {
    // 两承载直线相交于一点：s = (w×e)/(d×e)，u = (w×d)/(d×e)，精确有理数除法
    const sRat = qdiv(cross(w, e), den);
    const uRat = qdiv(cross(w, d), den);
    if (qle(ZERO, sRat) && qle(sRat, ONE) && qle(ZERO, uRat) && qle(uRat, ONE)) {
      return { kind: 'points', hits: [makeHit(A, d, sRat, uRat, segIndex)] };
    }
    return { kind: 'points', hits: [] };
  }

  // 平行：不共线则无交点
  if (qsign(cross(w, d)) !== 0) {
    return { kind: 'points', hits: [] };
  }

  // 共线：把折线端点投影到穿越线参数轴 s = ((P-A)·d)/(d·d)
  const len2 = qadd(qmul(d.row, d.row), qmul(d.col, d.col));
  const sProj = (p: RPoint): Q => {
    const v = pSub(p, A);
    const dot = qadd(qmul(v.row, d.row), qmul(v.col, d.col));
    return qdiv(dot, len2);
  };
  const s0 = sProj(P0);
  const s1 = sProj(P1);
  const lo = qmax(qmin(s0, s1), ZERO);
  const hi = qmin(qmax(s0, s1), ONE);
  if (qlt(lo, hi)) {
    return { kind: 'overlap' }; // 正长度重合 → 拒绝整次分析
  }
  if (qeq(lo, hi) && qle(ZERO, lo) && qle(lo, ONE)) {
    // 共线但仅一个端点相接：按普通点命中处理，绝不当作重合
    const u = qeq(s0, s1) ? ZERO : qeq(lo, s0) ? ZERO : ONE;
    return { kind: 'points', hits: [makeHit(A, d, lo, u, segIndex)] };
  }
  return { kind: 'points', hits: [] };
}

/**
 * 执行穿越线分析。任一线段与穿越线正长度重合时返回错误，
 * 调用方应保留上一次有效 TraverseResult，不得用重合端点顶替。
 */
export function analyzeTraverse(
  input: GridInput,
  result: ContourResult,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): AnalyzeOutcome {
  const valid = validateTraverse(startRow, startCol, endRow, endCol, input);
  if (!valid.ok) return { ok: false, error: valid.error };

  const A: RPoint = { row: qnum(startRow), col: qnum(startCol) };
  const B: RPoint = { row: qnum(endRow), col: qnum(endCol) };
  const d = pSub(B, A);

  // 第一阶段：任意折线与穿越线重合即拒绝；同时收集全部孤立命中
  const hitsByPoly = new Map<number, RawHit[]>();
  for (const poly of result.polylines) {
    const hits: RawHit[] = [];
    const segCount = poly.points.length + (poly.closed ? 0 : -1);
    for (let i = 0; i < segCount; i++) {
      const p0 = toRPoint(poly.points[i]);
      const p1 = toRPoint(poly.points[(i + 1) % poly.points.length]);
      const inter = intersectSegments(A, B, p0, p1, i);
      if (inter.kind === 'overlap') {
        return {
          ok: false,
          error: `穿越线与等高线 #${poly.id} 的线段重合，已拒绝本次分析并保留上次有效结果`,
        };
      }
      hits.push(...inter.hits);
    }
    hitsByPoly.set(poly.id, hits);
  }

  // 第二阶段：同一折线内按交点分组（共享顶点命中两段 → 一个事件）并分类
  const events: TraverseEvent[] = [];
  for (const poly of result.polylines) {
    const raw = hitsByPoly.get(poly.id) ?? [];
    if (raw.length === 0) continue;
    const segCount = poly.points.length + (poly.closed ? 0 : -1);

    // 按 s 分组：同一几何点在两段上的命中（共享顶点）合并
    const groups: RawHit[][] = [];
    for (const h of raw) {
      const g = groups.find((grp) => qeq(grp[0].s, h.s));
      if (g) g.push(h);
      else groups.push([h]);
    }

    for (const grp of groups) {
      const vertexIndex = locateVertex(poly, grp, segCount);
      if (vertexIndex !== null) {
        events.push(buildVertexEvent(poly, vertexIndex, d, grp[0].s));
      } else {
        // 线段内部相交：折线从一侧穿到另一侧
        const first = grp[0];
        events.push({
          s: toFraction(first.s),
          row: toFraction(first.point.row),
          col: toFraction(first.point.col),
          polylineId: poly.id,
          kind: 'cross',
          edgeId: null,
        });
      }
    }
  }

  // 稳定排序：先沿穿越线分数位置升序，s 相同再按折线编号
  events.sort((a, b) => cmpFrac(a.s, b.s) || a.polylineId - b.polylineId);

  return {
    ok: true,
    result: { startRow, startCol, endRow, endCol, events },
  };
}

function cmpFrac(a: Fraction, b: Fraction): number {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

function toRPoint(p: { row: Fraction; col: Fraction }): RPoint {
  return {
    row: [BigInt(p.row.num), BigInt(p.row.den)],
    col: [BigInt(p.col.num), BigInt(p.col.den)],
  };
}

/**
 * 判断一组共点命中是否对应折线顶点：
 * 任一命中 u=0 → 该段起点顶点；任一命中 u=1 → 下一段起点顶点（闭环回绕首点）。
 */
function locateVertex(poly: Polyline, grp: RawHit[], segCount: number): number | null {
  for (const h of grp) {
    if (qeq(h.u, ZERO)) return h.segIndex;
    if (qeq(h.u, ONE)) {
      if (h.segIndex + 1 < poly.points.length) return h.segIndex + 1;
      if (poly.closed && h.segIndex === segCount - 1) return 0;
    }
  }
  return null;
}

/**
 * 顶点命中分类：
 *  - 开放折线端点（只有一段相邻线段）→ endpoint；
 *  - 否则取顶点两侧线段另一端相对穿越线的叉积符号：
 *    异号 → cross，同号 → tangent（邻居共线必为正长度重合，已在上面拒绝）。
 */
function buildVertexEvent(
  poly: Polyline,
  vertexIndex: number,
  d: { row: Q; col: Q },
  s: Q,
): TraverseEvent {
  const n = poly.points.length;
  const neighbor = (delta: number): number => (vertexIndex + delta + n) % n;

  let kind: TraverseKind;
  if (!poly.closed && (vertexIndex === 0 || vertexIndex === n - 1)) {
    kind = 'endpoint';
  } else {
    const point = toRPoint(poly.points[vertexIndex]);
    const before = toRPoint(poly.points[neighbor(-1)]);
    const after = toRPoint(poly.points[neighbor(1)]);
    const sb = qsign(cross(pSub(before, point), d));
    const sa = qsign(cross(pSub(after, point), d));
    // 邻居与穿越线共线（叉积 0）必属正长度重合，第一阶段已拒绝；
    // 此处防御性兜底：不静默标成相切。
    if (sb === 0 || sa === 0) {
      throw new Error('内部错误：共线顶点未在重合检测阶段被拒绝');
    }
    kind = sb === sa ? 'tangent' : 'cross';
  }

  return {
    s: toFraction(s),
    row: poly.points[vertexIndex].row,
    col: poly.points[vertexIndex].col,
    polylineId: poly.id,
    kind,
    edgeId: poly.points[vertexIndex].edgeId,
  };
}
