// limiter.js — rate limiter por baseUrl: cola FIFO, concurrencia y espaciado minimo (anti 429)
export function makeLimiter({ concurrency = 2, minSpacingMs = 1500 } = {}) {
  const byBase = new Map();
  const state = (baseUrl) => {
    if (!byBase.has(baseUrl)) byBase.set(baseUrl, { active: 0, queue: [], lastStart: 0, timer: null });
    return byBase.get(baseUrl);
  };
  function pump(baseUrl) {
    const st = state(baseUrl);
    if (st.timer || !st.queue.length || st.active >= concurrency) return;
    const wait = Math.max(0, st.lastStart + minSpacingMs - Date.now());
    st.timer = setTimeout(() => {
      st.timer = null;
      while (st.queue.length && st.active < concurrency && Date.now() >= st.lastStart + minSpacingMs) {
        const task = st.queue.shift();
        st.active++;
        st.lastStart = Date.now();
        task();
      }
      pump(baseUrl);
    }, wait || 1);
  }
  return {
    acquire(baseUrl = 'default') {
      return new Promise((resolve) => {
        state(baseUrl).queue.push(() => {
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            state(baseUrl).active--;
            pump(baseUrl);
          });
        });
        pump(baseUrl);
      });
    },
  };
}
