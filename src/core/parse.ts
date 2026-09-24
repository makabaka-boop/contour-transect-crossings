import type { GridInput } from './types';

export const MIN_DIM = 2;
export const MAX_DIM = 60;

export type ParseResult = { ok: true; value: GridInput } | { ok: false; error: string };

/**
 * 解析并校验用户输入。任何一处不合法（坏维度、非整数、额外字段、
 * levelTwice 非奇数整数……）都拒绝整份输入，调用方应保留上次有效网格。
 */
export function parseGridInput(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '输入不是合法的 JSON 文本' };
  }
  return validateGridInput(raw);
}

export function validateGridInput(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '输入必须是包含 grid 与 levelTwice 的 JSON 对象' };
  }

  const allowed = ['grid', 'levelTwice'] as const;
  const keys = Object.keys(raw);
  const extra = keys.filter((k) => !allowed.includes(k as (typeof allowed)[number]));
  if (extra.length > 0) {
    return { ok: false, error: `包含额外字段：${extra.join('、')}，整份输入被拒绝` };
  }
  const missing = allowed.filter((k) => !(k in raw));
  if (missing.length > 0) {
    return { ok: false, error: `缺少字段：${missing.join('、')}` };
  }

  const { grid, levelTwice } = raw as { grid: unknown; levelTwice: unknown };

  if (!Array.isArray(grid)) {
    return { ok: false, error: 'grid 必须是二维数组' };
  }
  if (grid.length < MIN_DIM || grid.length > MAX_DIM) {
    return { ok: false, error: `行数 ${grid.length} 超出允许范围 ${MIN_DIM}–${MAX_DIM}` };
  }

  let cols = -1;
  for (let r = 0; r < grid.length; r++) {
    const row: unknown = grid[r];
    if (!Array.isArray(row)) {
      return { ok: false, error: `第 ${r + 1} 行不是数组` };
    }
    if (r === 0) {
      cols = row.length;
      if (cols < MIN_DIM || cols > MAX_DIM) {
        return { ok: false, error: `列数 ${cols} 超出允许范围 ${MIN_DIM}–${MAX_DIM}` };
      }
    } else if (row.length !== cols) {
      return { ok: false, error: `第 ${r + 1} 行长度 ${row.length} 与首行 ${cols} 不一致` };
    }
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] !== 'number' || !Number.isSafeInteger(row[c])) {
        return { ok: false, error: `第 ${r + 1} 行第 ${c + 1} 列的值不是整数` };
      }
    }
  }

  if (typeof levelTwice !== 'number' || !Number.isSafeInteger(levelTwice)) {
    return { ok: false, error: 'levelTwice 必须是整数' };
  }
  if (levelTwice % 2 === 0) {
    return { ok: false, error: 'levelTwice 必须是奇数，阈值 levelTwice/2 才不会落在整数顶点上' };
  }

  return { ok: true, value: { grid: grid as number[][], levelTwice } };
}
