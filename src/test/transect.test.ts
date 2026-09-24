import { describe, expect, it } from 'vitest';
import { computeContours } from '../core/contour';
import {
  add,
  cmp,
  div,
  makeFraction,
  mul,
  sign,
  sub,
  type Fraction,
} from '../core/fraction';
import { analyzeTransect, validateTransectEndpoints } from '../core/transect';
import type { Polyline, TransectLine } from '../core/types';

const f = (num: number, den = 1): Fraction => makeFraction(num, den);

const line = (sr: number, sc: number, er: number, ec: number): TransectLine => ({
  start: { row: f(sr), col: f(sc) },
  end: { row: f(er), col: f(ec) },
});

const run = (grid: number[][], levelTwice: number) =>
  computeContours({ grid, levelTwice });

// ---------- 独立预言机：BigInt 有理数线段相交 ----------
// 与 src/core/transect.ts 的 number 分数实现相互独立：
// 这里用 BigInt 任意精度有理数重写求交、顶点去重与三态分类，作为交叉验证基准。

interface BF {
  n: bigint;
  d: bigint; // 恒 > 0，已约分
}

const bgcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
};

const bf = (n: bigint, d: bigint): BF => {
  if (d === 0n) throw new Error('预言机：分母为 0');
  let nn = n;
  let dd = d;
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = bgcd(nn, dd);
  return { n: nn / g, d: dd / g };
};

const bfOf = (x: Fraction): BF => bf(BigInt(x.num), BigInt(x.den));
const bfAdd = (a: BF, b: BF): BF => bf(a.n * b.d + b.n * a.d, a.d * b.d);
const bfSub = (a: BF, b: BF): BF => bf(a.n * b.d - b.n * a.d, a.d * b.d);
const bfMul = (a: BF, b: BF): BF => bf(a.n * b.n, a.d * b.d);
const bfDiv = (a: BF, b: BF): BF => bf(a.n * b.d, a.d * b.n);
const bfSgn = (a: BF): number => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
const bfCmp = (a: BF, b: BF): number => bfSgn(bfSub(a, b));
const bfEq = (a: BF, b: BF): boolean => a.n === b.n && a.d === b.d;
const BZERO = bf(0n, 1n);
const BONE = bf(1n, 1n);

interface BP {
  row: BF;
  col: BF;
}

interface OracleEvent {
  t: BF;
  row: BF;
  col: BF;
  polylineId: number;
  kind: 'crossing' | 'tangent' | 'endpoint';
  vertexIndex: number | null;
  segmentIndex: number | null;
}

function oracleTransect(
  polylines: Polyline[],
  tl: TransectLine,
): 'coincident' | OracleEvent[] {
  const A: BP = { row: bfOf(tl.start.row), col: bfOf(tl.start.col) };
  const B: BP = { row: bfOf(tl.end.row), col: bfOf(tl.end.col) };
  const dr = bfSub(B.row, A.row);
  const dc = bfSub(B.col, A.col);
  const cross = (r1: BF, c1: BF, r2: BF, c2: BF): BF =>
    bfSub(bfMul(r1, c2), bfMul(c1, r2));

  const events: OracleEvent[] = [];

  for (const poly of polylines) {
    const pts: BP[] = poly.points.map((p) => ({ row: bfOf(p.row), col: bfOf(p.col) }));
    const n = pts.length;
    const segCount = poly.closed ? n : n - 1;

    interface Raw {
      u: BF;
      v: BF;
      seg: number;
    }
    const raw: Raw[] = [];

    for (let i = 0; i < segCount; i++) {
      const P = pts[i];
      const Q = pts[(i + 1) % n];
      const er = bfSub(Q.row, P.row);
      const ec = bfSub(Q.col, P.col);
      const denom = cross(dr, dc, er, ec);
      if (bfSgn(denom) === 0) {
        // 平行：仅共线时才可能相交
        if (bfSgn(cross(dr, dc, bfSub(P.row, A.row), bfSub(P.col, A.col))) !== 0) continue;
        const len2 = bfAdd(bfMul(dr, dr), bfMul(dc, dc));
        const proj = (R: BP): BF =>
          bfDiv(
            bfAdd(bfMul(bfSub(R.row, A.row), dr), bfMul(bfSub(R.col, A.col), dc)),
            len2,
          );
        const uP = proj(P);
        const uQ = proj(Q);
        const lo = bfCmp(uP, uQ) <= 0 ? uP : uQ;
        const hi = bfCmp(uP, uQ) <= 0 ? uQ : uP;
        const from = bfCmp(lo, BZERO) > 0 ? lo : BZERO;
        const to = bfCmp(hi, BONE) < 0 ? hi : BONE;
        if (bfCmp(from, to) < 0) return 'coincident';
        if (bfCmp(from, to) === 0) {
          const v = bfCmp(uP, uQ) === 0 ? BZERO : bfDiv(bfSub(from, uP), bfSub(uQ, uP));
          raw.push({ u: from, v, seg: i });
        }
        continue;
      }
      const par = bfSub(P.row, A.row);
      const pac = bfSub(P.col, A.col);
      const u = bfDiv(cross(par, pac, er, ec), denom);
      const v = bfDiv(cross(par, pac, dr, dc), denom);
      if (bfCmp(u, BZERO) < 0 || bfCmp(u, BONE) > 0) continue;
      if (bfCmp(v, BZERO) < 0 || bfCmp(v, BONE) > 0) continue;
      raw.push({ u, v, seg: i });
    }

    // 同一参数位置 = 同一交点：共享顶点只保留一个事件
    const byT = new Map<string, Raw[]>();
    for (const h of raw) {
      const key = `${h.u.n}/${h.u.d}`;
      const g = byT.get(key);
      if (g) g.push(h);
      else byT.set(key, [h]);
    }

    for (const group of byT.values()) {
      const u = group[0].u;
      let vertex: number | null = null;
      for (const h of group) {
        if (bfSgn(h.v) === 0) vertex = h.seg;
        else if (bfEq(h.v, BONE)) vertex = (h.seg + 1) % n;
      }
      if (vertex === null) {
        const h = group[0];
        const P = pts[h.seg];
        const Q = pts[(h.seg + 1) % n];
        events.push({
          t: u,
          row: bfAdd(P.row, bfMul(h.v, bfSub(Q.row, P.row))),
          col: bfAdd(P.col, bfMul(h.v, bfSub(Q.col, P.col))),
          polylineId: poly.id,
          kind: 'crossing',
          vertexIndex: null,
          segmentIndex: h.seg,
        });
        continue;
      }
      const point = pts[vertex];
      if (!poly.closed && (vertex === 0 || vertex === n - 1)) {
        events.push({
          t: u,
          row: point.row,
          col: point.col,
          polylineId: poly.id,
          kind: 'endpoint',
          vertexIndex: vertex,
          segmentIndex: null,
        });
        continue;
      }
      const prev = pts[(vertex - 1 + n) % n];
      const next = pts[(vertex + 1) % n];
      const sp = bfSgn(cross(dr, dc, bfSub(prev.row, A.row), bfSub(prev.col, A.col)));
      const sn = bfSgn(cross(dr, dc, bfSub(next.row, A.row), bfSub(next.col, A.col)));
      if (sp === 0 || sn === 0) return 'coincident'; // 与核心实现一致的兜底
      events.push({
        t: u,
        row: point.row,
        col: point.col,
        polylineId: poly.id,
        kind: sp === sn ? 'tangent' : 'crossing',
        vertexIndex: vertex,
        segmentIndex: null,
      });
    }
  }

  events.sort((a, b) => bfCmp(a.t, b.t) || a.polylineId - b.polylineId);
  return events;
}

// ---------- 分数运算 ----------

describe('分数四则运算与比较', () => {
  it('加减乘除约分正确', () => {
    expect(add(f(1, 2), f(1, 3))).toEqual({ num: 5, den: 6 });
    expect(sub(f(1, 2), f(1, 3))).toEqual({ num: 1, den: 6 });
    expect(mul(f(2, 3), f(3, 4))).toEqual({ num: 1, den: 2 });
    expect(div(f(1, 2), f(1, 4))).toEqual({ num: 2, den: 1 });
    expect(div(f(1, 2), f(-1, 4))).toEqual({ num: -2, den: 1 });
  });

  it('比较与符号', () => {
    expect(cmp(f(1, 3), f(1, 2))).toBe(-1);
    expect(cmp(f(2, 4), f(1, 2))).toBe(0);
    expect(cmp(f(3, 2), f(1, 2))).toBe(1);
    expect(sign(f(0, 1))).toBe(0);
    expect(sign(f(-3, 7))).toBe(-1);
  });
});

// ---------- 端点校验 ----------

describe('穿越线端点校验', () => {
  it('合法端点：吸附网格顶点，坐标记为分数', () => {
    const r = validateTransectEndpoints(3, 3, '0', '0', '2', '2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line.start).toEqual({ row: { num: 0, den: 1 }, col: { num: 0, den: 1 } });
      expect(r.line.end).toEqual({ row: { num: 2, den: 1 }, col: { num: 2, den: 1 } });
    }
  });

  it.each([
    ['起点=终点', ['0', '0', '0', '0']],
    ['行越界', ['0', '0', '3', '0']],
    ['列越界', ['0', '0', '0', '-1']],
    ['非整数', ['0', '0', '1.5', '0']],
    ['非数字', ['0', 'x', '2', '2']],
  ])('拒绝：%s', (_label, [sr, sc, er, ec]) => {
    expect(validateTransectEndpoints(3, 3, sr, sc, er, ec).ok).toBe(false);
  });
});

// ---------- 定向用例 ----------

// 3×3 中心高：闭环菱形，规范化后点为
// [(1,1/2), (1/2,1), (1,3/2), (3/2,1)]（见 contour.test.ts 的边序列 [2,7,3,10]）
const DIAMOND = run(
  [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  1,
);

describe('穿越事件：闭环', () => {
  it('对角穿越闭环：两个边内部穿越事件，按 t 排序', () => {
    const r = analyzeTransect(DIAMOND, line(0, 0, 2, 2));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(2);
    expect(r.result.events[0]).toMatchObject({
      t: { num: 3, den: 8 },
      row: { num: 3, den: 4 },
      col: { num: 3, den: 4 },
      polylineId: 0,
      kind: 'crossing',
      vertexIndex: null,
      segmentIndex: 0,
    });
    expect(r.result.events[1]).toMatchObject({
      t: { num: 5, den: 8 },
      row: { num: 5, den: 4 },
      col: { num: 5, den: 4 },
      polylineId: 0,
      kind: 'crossing',
      vertexIndex: null,
      segmentIndex: 2,
    });
  });

  it('顶点去重：横穿两个共享顶点，每处两段命中只返回一个事件', () => {
    // 穿越线 row=1 穿过顶点 (1,1/2) 与 (1,3/2)，每个顶点被相邻两段同时命中
    const r = analyzeTransect(DIAMOND, line(1, 0, 1, 2));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(2); // 4 次原始命中去重为 2 个事件
    expect(r.result.events[0]).toMatchObject({
      t: { num: 1, den: 4 },
      row: { num: 1, den: 1 },
      col: { num: 1, den: 2 },
      kind: 'crossing',
      vertexIndex: 0,
      segmentIndex: null,
    });
    expect(r.result.events[1]).toMatchObject({
      t: { num: 3, den: 4 },
      row: { num: 1, den: 1 },
      col: { num: 3, den: 2 },
      kind: 'crossing',
      vertexIndex: 2,
      segmentIndex: null,
    });
  });

  it('相切：擦过闭环顶点，前后邻点同侧', () => {
    // 直线 2·row+col=2 只接触顶点 (1/2,1)，其余顶点都在同侧
    const r = analyzeTransect(DIAMOND, line(0, 2, 1, 0));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(1);
    expect(r.result.events[0]).toMatchObject({
      t: { num: 1, den: 2 },
      row: { num: 1, den: 2 },
      col: { num: 1, den: 1 },
      kind: 'tangent',
      vertexIndex: 1,
      segmentIndex: null,
    });
  });
});

// 开放折线：(0,1/2) → (1,1/2) → (3/2,1) → (3/2,2)
const OPEN_LINE = run(
  [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
  1,
);

describe('穿越事件：开放折线', () => {
  it('端点接触：命中折线开放端点', () => {
    const r = analyzeTransect(OPEN_LINE, line(0, 0, 0, 2));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(1);
    expect(r.result.events[0]).toMatchObject({
      t: { num: 1, den: 4 },
      row: { num: 0, den: 1 },
      col: { num: 1, den: 2 },
      kind: 'endpoint',
      vertexIndex: 0,
      segmentIndex: null,
    });
  });

  it('开放折线内部顶点去重 + 相切', () => {
    // 直线 col=row/2 只接触中间顶点 (1,1/2)，前后邻点同侧
    const r = analyzeTransect(OPEN_LINE, line(0, 0, 2, 1));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(1);
    expect(r.result.events[0]).toMatchObject({
      t: { num: 1, den: 2 },
      row: { num: 1, den: 1 },
      col: { num: 1, den: 2 },
      kind: 'tangent',
      vertexIndex: 1,
      segmentIndex: null,
    });
  });
});

describe('穿越事件：鞍格', () => {
  it('鞍格两条折线各命中一次，按 t 再按折线编号排序', () => {
    // 鞍格（掩码 10，均值高于阈值 → 连接低角周围）：
    // 折线 #0: (0,3/4)-(1/4,1)，折线 #1: (1,1/4)-(3/4,0)
    const saddle = run(
      [
        [2, 0],
        [0, 2],
      ],
      1,
    );
    expect(saddle.polylines).toHaveLength(2);
    // 反对角线 row+col=1 与两段各交一次
    const r = analyzeTransect(saddle, line(0, 1, 1, 0));
    if (!r.ok) throw new Error('不应被拒绝');
    expect(r.result.events).toHaveLength(2);
    expect(r.result.events[0]).toMatchObject({
      t: { num: 1, den: 8 },
      row: { num: 1, den: 8 },
      col: { num: 7, den: 8 },
      polylineId: 0,
      kind: 'crossing',
    });
    expect(r.result.events[1]).toMatchObject({
      t: { num: 7, den: 8 },
      row: { num: 7, den: 8 },
      col: { num: 1, den: 8 },
      polylineId: 1,
      kind: 'crossing',
    });
  });
});

describe('重合拒绝', () => {
  // 折线含线段 (1,1/4)-(2,1/2)，与穿越线 (0,0)-(4,1) 共线且重叠
  const COINCIDENT_GRID = run(
    [
      [1, -1],
      [1, -1],
      [2, -1],
      [2, -1],
      [2, -1],
    ],
    1,
  );

  it('穿越线与等高线线段重合：拒绝整次分析', () => {
    const r = analyzeTransect(COINCIDENT_GRID, line(0, 0, 4, 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('重合');
  });

  it('独立预言机同样判重合', () => {
    expect(oracleTransect(COINCIDENT_GRID.polylines, line(0, 0, 4, 1))).toBe(
      'coincident',
    );
  });

  it('同一线走向但不重叠（平移一行）不判重合', () => {
    // 平移后与原线段平行不共线，应正常出事件而非拒绝
    const r = analyzeTransect(COINCIDENT_GRID, line(0, 1, 4, 2));
    expect(r.ok).toBe(true);
  });
});

// ---------- 独立预言机交叉验证 ----------

describe('独立有理数预言机交叉验证（随机网格 + 随机穿越线）', () => {
  it('核心实现与 BigInt 预言机逐事件一致，且事件按 (t, 折线编号) 排序', () => {
    let seed = 20260924;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const ri = (n: number) => rand() % n;

    let totalEvents = 0;
    let coincidentCases = 0;

    for (let iter = 0; iter < 300; iter++) {
      const rows = 2 + ri(7);
      const cols = 2 + ri(7);
      const grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ri(9) - 4),
      );
      const levelTwice = [1, 3, -1, -3, 5][ri(5)];
      const result = run(grid, levelTwice);

      const sr = ri(rows);
      const sc = ri(cols);
      let er = ri(rows);
      let ec = ri(cols);
      if (er === sr && ec === sc) er = (er + 1) % rows;
      const tl = line(sr, sc, er, ec);

      const core = analyzeTransect(result, tl);
      const oracle = oracleTransect(result.polylines, tl);

      if (oracle === 'coincident') {
        coincidentCases += 1;
        expect(core.ok).toBe(false);
        continue;
      }
      if (!core.ok) {
        throw new Error(`第 ${iter} 轮：核心实现拒绝但预言机未判重合`);
      }

      const events = core.result.events;
      expect(events).toHaveLength(oracle.length);
      events.forEach((ev, i) => {
        const o = oracle[i];
        expect(bfEq(bfOf(ev.t), o.t)).toBe(true);
        expect(bfEq(bfOf(ev.row), o.row)).toBe(true);
        expect(bfEq(bfOf(ev.col), o.col)).toBe(true);
        expect(ev.polylineId).toBe(o.polylineId);
        expect(ev.kind).toBe(o.kind);
        expect(ev.vertexIndex).toBe(o.vertexIndex);
        expect(ev.segmentIndex).toBe(o.segmentIndex);
      });
      totalEvents += events.length;

      // 排序不变式：按沿穿越线的分数位置，再按折线编号
      for (let i = 1; i < events.length; i++) {
        const c = cmp(events[i - 1].t, events[i].t);
        expect(c === 0 ? events[i - 1].polylineId < events[i].polylineId : c < 0).toBe(
          true,
        );
      }
    }

    // 防止测试形同空转：随机用例必须真的产生穿越事件
    expect(totalEvents).toBeGreaterThan(0);
    expect(coincidentCases).toBeGreaterThanOrEqual(0);
  });
});
