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

/** 行-列平面上的一个点，坐标沿用分数表示 */
export interface GridPoint {
  row: Fraction;
  col: Fraction;
}

/** 穿越线：两端吸附网格顶点（整数行列），坐标以分数记录 */
export interface TransectLine {
  start: GridPoint;
  end: GridPoint;
}

/** 穿越事件类型：穿越（前后异侧）/ 相切（前后同侧）/ 端点接触（折线开放端点） */
export type TransectEventKind = 'crossing' | 'tangent' | 'endpoint';

/** 穿越线与一条等高线折线的一次命中 */
export interface TransectEvent {
  /** 沿穿越线从起点出发的分数位置，位于 [0,1] */
  t: Fraction;
  row: Fraction;
  col: Fraction;
  polylineId: number;
  kind: TransectEventKind;
  /** 命中折线顶点时的点下标；边内部命中为 null */
  vertexIndex: number | null;
  /** 命中折线边内部时的线段下标；顶点命中为 null */
  segmentIndex: number | null;
}

/** 穿越分析结果：SVG 标记、明细表与下载 JSON 共用同一事件数组 */
export interface TransectResult {
  line: TransectLine;
  events: TransectEvent[];
}

/** 穿越线与任一等高线线段重合时拒绝整次分析（ok: false），调用方保留上次有效结果 */
export type TransectAnalysis =
  | { ok: true; result: TransectResult }
  | { ok: false; error: string };
