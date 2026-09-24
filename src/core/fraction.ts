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

export function fractionToNumber(f: Fraction): number {
  return f.num / f.den;
}

export function formatFraction(f: Fraction): string {
  return f.den === 1 ? String(f.num) : `${f.num}/${f.den}`;
}
