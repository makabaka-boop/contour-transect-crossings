import {
  add,
  cmp,
  div,
  makeFraction,
  mul,
  sign,
  sub,
  type Fraction,
} from './fraction';
import type {
  ContourResult,
  GridPoint,
  Polyline,
  TransectAnalysis,
  TransectEvent,
  TransectEventKind,
  TransectLine,
} from './types';

/**
 * 穿越线分析：
 *  1. 穿越线两端吸附网格顶点（整数行列），坐标沿用分数表示；
 *  2. 逐段与已规范化的等高线折线求精确交点（全程分数运算，无浮点误差）；
 *  3. 同一折线在共享顶点处被相邻两段同时命中时，只返回一个事件；
 *  4. 按交点前后位于穿越线两侧 / 同侧 / 折线开放端点，标为穿越 / 相切 / 端点接触；
 *  5. 若与任一等高线线段重合（共线且重叠长度为正），拒绝整次分析，
 *     由调用方保留上次有效穿越结果，不任意挑一个重合端点充数；
 *  6. 事件按沿穿越线的分数位置、再按折线编号稳定排序，
 *     SVG 标记、明细表与下载 JSON 共用同一事件数组。
 */

const ZERO: Fraction = { num: 0, den: 1 };
const ONE: Fraction = { num: 1, den: 1 };

export const TRANSECT_KIND_LABELS: Record<TransectEventKind, string> = {
  crossing: '穿越',
  tangent: '相切',
  endpoint: '端点接触',
};

function subPoint(a: GridPoint, b: GridPoint): GridPoint {
  return { row: sub(a.row, b.row), col: sub(a.col, b.col) };
}

/** 行-列平面叉积 u × v = u.row·v.col − u.col·v.row */
function cross(u: GridPoint, v: GridPoint): Fraction {
  return sub(mul(u.row, v.col), mul(u.col, v.row));
}

/** a + t·(b − a) */
function lerpPoint(a: GridPoint, b: GridPoint, t: Fraction): GridPoint {
  return {
    row: add(a.row, mul(t, sub(b.row, a.row))),
    col: add(a.col, mul(t, sub(b.col, a.col))),
  };
}

type SegIntersection =
  | { type: 'none' }
  | { type: 'coincident' }
  | { type: 'point'; t: Fraction; s: Fraction };

/**
 * 穿越线 AB 与折线段 PQ 精确求交。
 * 返回的 t 为交点沿 AB 的参数、s 为沿 PQ 的参数，均落在闭区间 [0,1] 才算命中；
 * 共线且重叠长度为正 → coincident（整次分析应被拒绝）。
 */
function intersectSegment(
  A: GridPoint,
  B: GridPoint,
  P: GridPoint,
  Q: GridPoint,
): SegIntersection {
  const d = subPoint(B, A);
  const e = subPoint(Q, P);
  const pa = subPoint(P, A);
  const denom = cross(d, e);
  if (sign(denom) === 0) {
    if (sign(cross(d, pa)) !== 0) return { type: 'none' }; // 平行但不共线
    // 共线：把 P、Q 投影到穿越线参数上，考察与 [0,1] 的重叠区间
    const len2 = add(mul(d.row, d.row), mul(d.col, d.col)); // 起点≠终点 ⇒ 严格为正
    const proj = (R: GridPoint): Fraction => {
      const ra = subPoint(R, A);
      return div(add(mul(ra.row, d.row), mul(ra.col, d.col)), len2);
    };
    const tP = proj(P);
    const tQ = proj(Q);
    const lo = cmp(tP, tQ) <= 0 ? tP : tQ;
    const hi = cmp(tP, tQ) <= 0 ? tQ : tP;
    const from = cmp(lo, ZERO) > 0 ? lo : ZERO;
    const to = cmp(hi, ONE) < 0 ? hi : ONE;
    if (cmp(from, to) < 0) return { type: 'coincident' };
    if (cmp(from, to) === 0) {
      // 单点接触：把接触点换算回 PQ 的参数（防御性分支）
      const s = cmp(tP, tQ) === 0 ? ZERO : div(sub(from, tP), sub(tQ, tP));
      return { type: 'point', t: from, s };
    }
    return { type: 'none' };
  }
  const t = div(cross(pa, e), denom);
  const s = div(cross(pa, d), denom);
  if (cmp(t, ZERO) < 0 || cmp(t, ONE) > 0 || cmp(s, ZERO) < 0 || cmp(s, ONE) > 0) {
    return { type: 'none' };
  }
  return { type: 'point', t, s };
}

interface RawHit {
  seg: number;
  s: Fraction;
}

/**
 * 单条折线与穿越线求交，产出该折线上的全部事件；
 * 发现重合线段时返回 'coincident'。
 */
function analyzePolyline(
  poly: Polyline,
  A: GridPoint,
  B: GridPoint,
): TransectEvent[] | 'coincident' {
  const pts = poly.points;
  const n = pts.length;
  const segCount = poly.closed ? n : n - 1;
  const d = subPoint(B, A);

  // 逐段求交，并按沿穿越线的位置 t 分组：同一分数位置即同一交点
  const groups = new Map<string, { t: Fraction; hits: RawHit[] }>();
  for (let i = 0; i < segCount; i++) {
    const hit = intersectSegment(A, B, pts[i], pts[(i + 1) % n]);
    if (hit.type === 'coincident') return 'coincident';
    if (hit.type === 'none') continue;
    const key = `${hit.t.num}/${hit.t.den}`;
    const group = groups.get(key);
    const raw: RawHit = { seg: i, s: hit.s };
    if (group) group.hits.push(raw);
    else groups.set(key, { t: hit.t, hits: [raw] });
  }

  const events: TransectEvent[] = [];
  for (const { t, hits } of groups.values()) {
    // 共享顶点命中：相邻两段在同一折线顶点处各报一次，去重为一个事件
    let vertexIndex: number | null = null;
    for (const h of hits) {
      if (sign(h.s) === 0) vertexIndex = h.seg;
      else if (cmp(h.s, ONE) === 0) vertexIndex = (h.seg + 1) % n;
    }
    const point = lerpPoint(A, B, t);
    const base = { t, row: point.row, col: point.col, polylineId: poly.id };

    if (vertexIndex === null) {
      // 边内部命中：折线必然从穿越线一侧穿到另一侧
      events.push({
        ...base,
        kind: 'crossing',
        vertexIndex: null,
        segmentIndex: hits[0].seg,
      });
      continue;
    }

    const v = vertexIndex;
    if (!poly.closed && (v === 0 || v === n - 1)) {
      events.push({ ...base, kind: 'endpoint', vertexIndex: v, segmentIndex: null });
      continue;
    }

    // 顶点前后邻点相对穿越线的侧向决定穿越还是相切
    const prev = pts[(v - 1 + n) % n];
    const next = pts[(v + 1) % n];
    const sidePrev = sign(cross(d, subPoint(prev, A)));
    const sideNext = sign(cross(d, subPoint(next, A)));
    if (sidePrev === 0 || sideNext === 0) {
      // 邻点落在穿越线所在直线上 ⇒ 相邻线段与穿越线共线且经该顶点重叠，
      // 正常流程已在逐段求交时判重合；此处为防御性兜底。
      return 'coincident';
    }
    events.push({
      ...base,
      kind: sidePrev === sideNext ? 'tangent' : 'crossing',
      vertexIndex: v,
      segmentIndex: null,
    });
  }
  return events;
}

/** 对整份描线结果执行穿越分析；重合则拒绝（ok: false） */
export function analyzeTransect(
  contours: ContourResult,
  line: TransectLine,
): TransectAnalysis {
  const events: TransectEvent[] = [];
  for (const poly of contours.polylines) {
    const r = analyzePolyline(poly, line.start, line.end);
    if (r === 'coincident') {
      return {
        ok: false,
        error: `穿越线与折线 #${poly.id} 的线段重合（共线且重叠）`,
      };
    }
    events.push(...r);
  }
  events.sort((a, b) => cmp(a.t, b.t) || a.polylineId - b.polylineId);
  return { ok: true, result: { line, events } };
}

/**
 * 校验穿越线端点：必须是网格顶点（整数行列、落在网格范围内），且起点≠终点。
 * 任一不合法即拒绝，调用方保留上次有效穿越结果。
 */
export function validateTransectEndpoints(
  rows: number,
  cols: number,
  startRow: string,
  startCol: string,
  endRow: string,
  endCol: string,
): { ok: true; line: TransectLine } | { ok: false; error: string } {
  const parse = (label: string, text: string, max: number): number | string => {
    const trimmed = text.trim();
    if (!/^-?\d+$/.test(trimmed)) return `${label}必须是整数（网格顶点行列）`;
    const v = Number(trimmed);
    if (!Number.isSafeInteger(v)) return `${label}超出可表示范围`;
    if (v < 0 || v > max) return `${label}必须在 0–${max} 之间（当前网格 ${rows}×${cols}）`;
    return v;
  };

  const sr = parse('起点行', startRow, rows - 1);
  if (typeof sr === 'string') return { ok: false, error: sr };
  const sc = parse('起点列', startCol, cols - 1);
  if (typeof sc === 'string') return { ok: false, error: sc };
  const er = parse('终点行', endRow, rows - 1);
  if (typeof er === 'string') return { ok: false, error: er };
  const ec = parse('终点列', endCol, cols - 1);
  if (typeof ec === 'string') return { ok: false, error: ec };

  if (sr === er && sc === ec) {
    return { ok: false, error: '穿越线起点与终点不能相同' };
  }
  return {
    ok: true,
    line: {
      start: { row: makeFraction(sr, 1), col: makeFraction(sc, 1) },
      end: { row: makeFraction(er, 1), col: makeFraction(ec, 1) },
    },
  };
}
