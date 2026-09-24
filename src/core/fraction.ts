/**
 * 整数分数：交点位置一律以约分后的 num/den 记录，den 恒为正。
 * 阈值 levelTwice/2 与整数顶点值之差是半整数，因此交点比例可精确表示。
 */
export interface Fraction {
  num: number;
  den: number; // 恒 > 0，且 gcd(|num|, den) = 1
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0 ? 1 : x;
}

export function makeFraction(num: number, den: number): Fraction {
  if (den === 0) throw new Error('分数分母不能为 0');
  let n = num;
  let d = den;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/** f + k，k 为整数 */
export function addInteger(f: Fraction, k: number): Fraction {
  return makeFraction(f.num + k * f.den, f.den);
}

export function add(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.num, a.den * b.den);
}

/** a / b，b 不能为 0 */
export function div(a: Fraction, b: Fraction): Fraction {
  if (b.num === 0) throw new Error('分数除法的除数不能为 0');
  return makeFraction(a.num * b.den, a.den * b.num);
}

/** 比较两个分数：a < b 返回 -1，相等返回 0，a > b 返回 1 */
export function cmp(a: Fraction, b: Fraction): number {
  return Math.sign(a.num * b.den - b.num * a.den);
}

/** 符号：-1 / 0 / 1 */
export function sign(f: Fraction): number {
  return Math.sign(f.num);
}

export function fractionToNumber(f: Fraction): number {
  return f.num / f.den;
}

export function formatFraction(f: Fraction): string {
  return f.den === 1 ? String(f.num) : `${f.num}/${f.den}`;
}
