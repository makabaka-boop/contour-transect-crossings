import { describe, expect, it } from 'vitest';
import { parseGridInput, validateGridInput } from '../core/parse';

const okGrid = {
  grid: [
    [0, 1],
    [1, 0],
  ],
  levelTwice: 1,
};

describe('输入校验：接受合法输入', () => {
  it('最小 2×2 网格', () => {
    const r = parseGridInput(JSON.stringify(okGrid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.levelTwice).toBe(1);
      expect(r.value.grid).toHaveLength(2);
    }
  });

  it('最大 60×60 网格与负奇数 levelTwice', () => {
    const grid = Array.from({ length: 60 }, (_, r) =>
      Array.from({ length: 60 }, (_, c) => r * 60 + c),
    );
    const r = validateGridInput({ grid, levelTwice: -3 });
    expect(r.ok).toBe(true);
  });
});

describe('输入校验：坏维度拒绝整份输入', () => {
  it.each([
    ['行数过少', { grid: [[1, 2]], levelTwice: 1 }],
    ['行数过多', { grid: Array.from({ length: 61 }, () => [1, 2]), levelTwice: 1 }],
    ['列数过少', { grid: [[1], [2]], levelTwice: 1 }],
    [
      '列数过多',
      { grid: [Array(61).fill(0), Array(61).fill(0)], levelTwice: 1 },
    ],
    ['行长度不一致', { grid: [[1, 2], [1, 2, 3]], levelTwice: 1 }],
    ['空网格', { grid: [], levelTwice: 1 }],
  ])('%s', (_name, input) => {
    const r = validateGridInput(input);
    expect(r.ok).toBe(false);
  });
});

describe('输入校验：非整数与非法 levelTwice', () => {
  it.each([
    ['小数值', { grid: [[1.5, 2], [3, 4]], levelTwice: 1 }],
    ['字符串值', { grid: [['1', 2], [3, 4]], levelTwice: 1 }],
    ['null 值', { grid: [[null, 2], [3, 4]], levelTwice: 1 }],
    ['偶数 levelTwice', { grid: [[1, 2], [3, 4]], levelTwice: 2 }],
    ['小数 levelTwice', { grid: [[1, 2], [3, 4]], levelTwice: 1.5 }],
    ['字符串 levelTwice', { grid: [[1, 2], [3, 4]], levelTwice: '1' }],
  ])('%s', (_name, input) => {
    expect(validateGridInput(input).ok).toBe(false);
  });
});

describe('输入校验：字段结构', () => {
  it('额外字段拒绝整份输入', () => {
    const r = validateGridInput({ ...okGrid, smoothing: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('smoothing');
  });

  it('缺少字段', () => {
    expect(validateGridInput({ grid: okGrid.grid })).toMatchObject({ ok: false });
    expect(validateGridInput({ levelTwice: 1 })).toMatchObject({ ok: false });
  });

  it('根节点不是对象或不是合法 JSON', () => {
    expect(validateGridInput([1, 2]).ok).toBe(false);
    expect(validateGridInput('x').ok).toBe(false);
    expect(parseGridInput('{not json').ok).toBe(false);
  });
});
