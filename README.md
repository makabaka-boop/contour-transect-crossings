# 等高线描线工作台

离线纯前端工作台：导入整数高程网格与奇数 `levelTwice`（真实阈值 `levelTwice/2`），
用 marching squares 逐格描线，再把相邻格的线段拼接成**连续且确定**的等高线拓扑
（开放折线 / 闭环），同一份结果同时驱动 SVG 渲染、折线表与下载 JSON。

技术栈：TypeScript + React + Vite，Vitest 单测，Docker Compose 运行。

## 运行

```bash
# Docker（推荐）
docker compose up web          # http://localhost:5173

# 本地
npm install
npm run dev                    # http://localhost:5173
```

## 测试

```bash
npm test                       # 本地 Vitest
docker compose run --rm test   # 容器内 Vitest
```

## 输入格式

```json
{
  "grid": [[0, 1], [1, 0]],
  "levelTwice": 1
}
```

- `grid`：2–60 行 × 2–60 列的整数矩阵，各行等长；
- `levelTwice`：奇数整数。阈值为 `levelTwice/2`，因此绝不落在整数顶点上，无退化情形；
- 只允许这两个字段。**坏维度、非整数、缺字段或额外字段都会拒绝整份输入**，
  并保留上次有效网格；编辑文本会立即撤销当前描线，需重新点击「生成等高线」。

## 算法约定（`src/core/contour.ts`）

1. **交点记录**：逐条网格边检测跨阈值交点，位置以约分后的整数分数
   `{num, den}` 记录（比例 `t = (levelTwice - 2a) / (2(b - a))`，严格位于 `(0,1)`）。
2. **边标识**：水平边 `H(r,c) = r*(C-1)+c`；竖直边 `V(r,c) = R*(C-1) + r*C + c`，
   全网格唯一，相邻格通过共享边标识拼接。
3. **逐格线段**：四角高低组成 4 位掩码，查表得到格内线段。
4. **鞍格消歧**（四交点，掩码 5/10）：四角均值高于阈值 → 连接低角周围交点；
   低于阈值 → 连接高角周围交点；恰等 → 固定连接左上与右下角周围交点。
   均值比较转化为整数比较 `sum` 对 `2*levelTwice`，无浮点误差。
5. **拼接**：每条跨阈值边是至多两条线段的端点（边界 1 条、内部 2 条），
   因此连通分量只有开放路径与闭环两种。
6. **规范化**：开放折线从边标识较小的端点出发；闭环旋转到最小边标识为首点、
   并定向使第二点边标识小于末点；全体折线按最小边标识升序排列。结果完全确定。

## 输出

- **SVG**：网格、顶点值、交点与按折线着色的等高线；
- **折线表**：每条折线的类型（开放/闭环）、点数、最小边标识与逐点分数坐标；
- **下载 JSON**：与界面完全相同的 `ContourResult`
  （`crossings` / `segments` / `polylines`，坐标均为 `{num, den}` 分数）。

## 目录结构

```
src/
  core/
    fraction.ts   整数分数（约分、比较、格式化）
    parse.ts      输入校验（拒绝整份非法输入）
    contour.ts    marching squares + 鞍点消歧 + 折线拼接规范化
    types.ts      GridInput / Crossing / Segment / Polyline / ContourResult
  components/     InputPanel / ContourSvg / PolylineTable
  test/           Vitest：鞍点三态、闭环、边界开线、共享交点、分数、排序、校验
```
