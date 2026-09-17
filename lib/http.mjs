// Retry only reads: a timed-out mutation may already have succeeded upstream.
export async function upstreamFetch(url, options = {}) {
  const read = !options.method || options.method === "GET";
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !read ||
      attempt >= 2 ||
      ![429, 502, 503, 504].includes(response.status)
    )
      return response;
    const delay = Math.min(
      2000,
      Math.max(
        250,
        Number(response.headers.get("retry-after") || 0) * 1000 ||
          250 * 2 ** attempt,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
