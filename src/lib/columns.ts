/** Splits blocks, kept in order and whole, into at most k columns so the tallest column is as short as it can be. Returns each column's block indices. */
export function balance(heights: number[], k: number): number[][] {
  const n = heights.length
  if (!n) return []
  let best: number[][] = [heights.map((_, i) => i)], bestMax = heights.reduce((a, h) => a + h, 0)
  // ponytail: tries every set of cuts, fine for the seven categories; a linear-partition DP if blocks ever run to dozens.
  const walk = (from: number, left: number, cols: number[][], max: number) => {
    if (max >= bestMax) return
    if (left === 1 || from === n - 1) {
      const rest = heights.slice(from).reduce((a, h) => a + h, 0)
      if (Math.max(max, rest) < bestMax) { bestMax = Math.max(max, rest); best = [...cols, Array.from({ length: n - from }, (_, i) => from + i)] }
      return
    }
    let h = 0
    for (let to = from + 1; to < n; to++) {
      h += heights[to - 1]
      walk(to, left - 1, [...cols, Array.from({ length: to - from }, (_, i) => from + i)], Math.max(max, h))
    }
  }
  walk(0, k, [], 0)
  return best
}
