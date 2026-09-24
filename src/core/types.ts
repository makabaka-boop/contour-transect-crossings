import type { Fraction } from './fraction';

/** 校验通过的输入：整数高程网格 + 奇数 levelTwice（真实阈值为 levelTwice/2） */
export interface GridInput {
  grid: number[][];
  levelTwice: number;
}

/** 折线上的一个点：所在网格边标识 + 精确分数坐标（行、列） */
export interface CrossPoint {
  edgeId: number;
  row: Fraction;
  col: Fraction;
}

/** 一条跨阈值网格边上的交点 */
export interface Crossing extends CrossPoint {
  /** 沿边从首端点出发的比例，严格位于 (0, 1) */
  t: Fraction;
}

/** 单个格内生成的一段线段（连接两条跨阈值边） */
export interface Segment {
  cellRow: number;
  cellCol: number;
  edgeA: number;
  edgeB: number;
}

/** 拼接后的等高线：开放折线或闭环，点序已规范化 */
export interface Polyline {
  id: number;
  closed: boolean;
  minEdgeId: number;
  points: CrossPoint[];
}

/** 描线结果：SVG、折线表与下载 JSON 共用同一份数据 */
export interface ContourResult {
  rows: number;
  cols: number;
  levelTwice: number;
  crossings: Crossing[];
  segments: Segment[];
  polylines: Polyline[];
}
