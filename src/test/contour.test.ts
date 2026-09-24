import { describe, expect, it } from 'vitest';
import {
  computeContours,
  crossingFraction,
  horizontalEdgeId,
  verticalEdgeId,
} from '../core/contour';
import type { GridInput } from '../core/types';

const run = (grid: number[][], levelTwice: number) =>
  computeContours({ grid, levelTwice });

/** 折线的边标识序列 */
const edgeSeq = (input: GridInput) =>
  computeContours(input).polylines.map((p) => p.points.map((pt) => pt.edgeId));

/** 归一化后的无序线段对，便于断言 */
const segmentPairs = (input: GridInput) =>
  computeContours(input)
    .segments.map((s) => [Math.min(s.edgeA, s.edgeB), Math.max(s.edgeA, s.edgeB)])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('跨阈值边交点（整数分数记录）', () => {
  it('交点比例约分且严格位于 (0,1)', () => {
    // t = (1/2 - 0) / (3 - 0) = 1/6
    expect(crossingFraction(0, 3, 1)).toEqual({ num: 1, den: 6 });
    // t = (1/2 - 0) / (2 - 0) = 1/4
    expect(crossingFraction(0, 2, 1)).toEqual({ num: 1, den: 4 });
    // 反向边同样约分且分母为正
    expect(crossingFraction(3, 0, 1)).toEqual({ num: 5, den: 6 });
    // 同侧不跨阈值
    expect(crossingFraction(1, 2, 1)).toBeNull();
    expect(crossingFraction(-2, -1, 1)).toBeNull();
  });

  it('交点坐标以分数记录：行/列各为整数加比例', () => {
    const result = run(
      [
        [0, 3],
        [3, 3],
      ],
      1,
    );
    const top = result.crossings.find((c) => c.edgeId === horizontalEdgeId(0, 0, 2));
    const left = result.crossings.find((c) => c.edgeId === verticalEdgeId(0, 0, 2, 2));
    expect(top).toMatchObject({ t: { num: 1, den: 6 }, row: { num: 0, den: 1 }, col: { num: 1, den: 6 } });
    expect(left).toMatchObject({ t: { num: 1, den: 6 }, row: { num: 1, den: 6 }, col: { num: 0, den: 1 } });
  });
});

describe('逐格线段：鞍格消歧', () => {
  const saddle = [
    [2, 0],
    [0, 2],
  ]; // 左上、右下高（掩码 10），四角和 = 4

  it('四角均值高于阈值 → 连接低角周围交点', () => {
    // levelTwice=1：均值 1 > 1/2，低角为右上、左下 → (上,右) 与 (左,下)
    expect(segmentPairs({ grid: saddle, levelTwice: 1 })).toEqual([
      [0, 3],
      [1, 2],
    ]);
  });

  it('四角均值低于阈值 → 连接高角周围交点', () => {
    // levelTwice=3：均值 1 < 3/2，高角为左上、右下 → (左,上) 与 (下,右)
    expect(segmentPairs({ grid: saddle, levelTwice: 3 })).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('四角均值恰等阈值 → 固定连接左上与右下角周围交点', () => {
    // 两种对角鞍格在 levelTwice=1 下四角和都恰为 2*levelTwice
    const tieA = segmentPairs({
      grid: [
        [1, 0],
        [0, 1],
      ],
      levelTwice: 1,
    });
    const tieB = segmentPairs({
      grid: [
        [0, 1],
        [1, 0],
      ],
      levelTwice: 1,
    });
    expect(tieA).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(tieB).toEqual(tieA);
  });
});

describe('折线拼接', () => {
  it('边界开线：2×2 单格，两端点都落在边界上', () => {
    const result = run(
      [
        [0, 1],
        [0, 1],
      ],
      1,
    );
    expect(result.polylines).toHaveLength(1);
    const line = result.polylines[0];
    expect(line.closed).toBe(false);
    expect(line.points.map((p) => p.edgeId)).toEqual([0, 1]);
    expect(line.points[0]).toMatchObject({ row: { num: 0, den: 1 }, col: { num: 1, den: 2 } });
    expect(line.points[1]).toMatchObject({ row: { num: 1, den: 1 }, col: { num: 1, den: 2 } });
  });

  it('闭环：3×3 中心高，四个格拼成菱形环，方向规范确定', () => {
    const result = run(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      1,
    );
    expect(result.polylines).toHaveLength(1);
    const loop = result.polylines[0];
    expect(loop.closed).toBe(true);
    // 最小边标识 2 为首点，且按邻居中较小者定向
    expect(loop.points.map((p) => p.edgeId)).toEqual([2, 7, 3, 10]);
    expect(loop.minEdgeId).toBe(2);
  });

  it('相邻格共享交点：共享边只记录一次，且成为折线中间关节', () => {
    const result = run(
      [
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 1],
      ],
      1,
    );
    // 两个相邻格各出一段，经共享竖直边 V(1,1)（标识 10）拼成一条开线
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every((s) => s.edgeA === 10 || s.edgeB === 10)).toBe(true);
    expect(result.crossings.filter((c) => c.edgeId === 10)).toHaveLength(1);
    expect(result.polylines).toHaveLength(1);
    expect(result.polylines[0].closed).toBe(false);
    expect(result.polylines[0].points.map((p) => p.edgeId)).toEqual([9, 10, 11]);
  });

  it('多条折线按最小边标识规范排序', () => {
    const seq = edgeSeq({
      grid: [
        [0, 1, 0, 1],
        [0, 1, 0, 1],
      ],
      levelTwice: 1,
    });
    expect(seq).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ]);
  });
});

describe('整体性质（确定性伪随机网格）', () => {
  it('交点比例严格位于 (0,1)，折线点数与排序不变式成立', () => {
    // 固定种子的 LCG，保证测试确定
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const grid = Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => rand() % 7 - 3),
    );
    const result = run(grid, 3);

    for (const c of result.crossings) {
      expect(c.t.num).toBeGreaterThan(0);
      expect(c.t.num).toBeLessThan(c.t.den);
    }
    let prevMin = -1;
    for (const p of result.polylines) {
      expect(p.points.length).toBeGreaterThanOrEqual(p.closed ? 3 : 2);
      expect(p.minEdgeId).toBe(Math.min(...p.points.map((pt) => pt.edgeId)));
      expect(p.minEdgeId).toBeGreaterThan(prevMin); // 严格递增 ⇒ 排序确定
      prevMin = p.minEdgeId;
      if (!p.closed) {
        // 开放折线首点边标识小于末点
        expect(p.points[0].edgeId).toBeLessThan(p.points[p.points.length - 1].edgeId);
      }
    }
    // 线段端点引用总数 = 边界边×1 + 内部共享边×2；折线中每条边只出现一次
    const segUse = result.segments.length * 2;
    const pointUse = result.polylines.reduce((n, p) => n + p.points.length, 0);
    const interior = result.crossings.length - countBoundaryCrossings(result);
    expect(pointUse).toBe(segUse - interior);
    expect(pointUse).toBe(result.crossings.length);
  });
});

function countBoundaryCrossings(result: ReturnType<typeof computeContours>): number {
  const { rows, cols } = result;
  const hCount = rows * (cols - 1);
  return result.crossings.filter((c) => {
    if (c.edgeId < hCount) {
      const r = Math.floor(c.edgeId / (cols - 1));
      return r === 0 || r === rows - 1;
    }
    const v = c.edgeId - hCount;
    const cc = v % cols;
    return cc === 0 || cc === cols - 1;
  }).length;
}
