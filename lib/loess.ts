/**
 * Simple LOESS (locally estimated scatterplot smoothing) implementation.
 * Uses local linear regression with a tricube kernel.
 *
 * @param ys   Array of y values (x = indices 0..n-1)
 * @param bandwidth  Fraction of points used for each local fit (0–1, default 0.5)
 * @returns Array of smoothed y values, same length as ys
 */
export function loess(ys: number[], bandwidth = 0.5): number[] {
  const n = ys.length
  if (n < 3) return [...ys]

  const xs = ys.map((_, i) => i)
  const k = Math.max(2, Math.floor(bandwidth * n))

  return xs.map((xi) => {
    // Distances from xi to all other points
    const dists = xs.map((xj) => Math.abs(xj - xi))

    // k-th smallest distance = neighbourhood radius
    const sorted = [...dists].sort((a, b) => a - b)
    const maxDist = sorted[k - 1] || 1

    // Tricube weights: w = (1 - (d/maxDist)^3)^3  for d < maxDist, else 0
    const w = dists.map((d) => {
      if (d >= maxDist) return 0
      const u = d / maxDist
      return Math.pow(1 - Math.pow(u, 3), 3)
    })

    // Weighted linear regression: minimise Σ w*(y - a - b*x)^2
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0
    for (let j = 0; j < n; j++) {
      sw   += w[j]
      swx  += w[j] * xs[j]
      swy  += w[j] * ys[j]
      swxx += w[j] * xs[j] * xs[j]
      swxy += w[j] * xs[j] * ys[j]
    }

    const det = sw * swxx - swx * swx
    if (Math.abs(det) < 1e-10 || sw === 0) return swy / sw  // fallback: weighted mean

    const b = (sw * swxy - swx * swy) / det
    const a = (swy - b * swx) / sw
    return a + b * xi
  })
}
