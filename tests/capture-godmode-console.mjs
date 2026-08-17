// captura errores de consola reales de god-mode.html en Edge headless vía CDP
const PORT = 9223;

async function main() {
  let pages;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      pages = await res.json();
      if (pages.some((p) => p.type === 'page')) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const page = pages.find((p) => p.type === 'page');
  if (!page) { console.log('ERR: sin pagina'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({ type: 'exception', text: d.text, desc: d.exception && d.exception.description, line: d.lineNumber, url: d.url });
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      errors.push({ type: 'console', args: m.params.args.map((a) => a.value || a.description).join(' ') });
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push({ type: 'log', text: m.params.entry.text, url: m.params.entry.url });
    }
    if (m.id === 1) {
      // navegar de nuevo para capturar desde cero
      send(2, 'Page.enable'); send(3, 'Page.navigate', { url: 'http://localhost:3779/god-mode.html' });
    }
  };
  ws.onopen = () => { send(1, 'Runtime.enable'); send(0, 'Log.enable'); };
  // esperar 7 segundos de ejecución
  await new Promise((r) => setTimeout(r, 9000));
  // estado del DOM
  send(50, 'Runtime.evaluate', { expression: `JSON.stringify({
    stageW: document.getElementById('gmStage').getBoundingClientRect().width,
    stageH: document.getElementById('gmStage').getBoundingClientRect().height,
    cvW: document.getElementById('gmWorld').width, cvH: document.getElementById('gmWorld').height,
    tickerKids: document.getElementById('gmTicker').children.length,
    subtoolVisible: !document.getElementById('gmSubtool').classList.contains('hidden'),
    bodyH: document.body.getBoundingClientRect().height
  })`, returnByValue: true });
  await new Promise((r) => setTimeout(r, 1000));
  const last = await new Promise((resolve) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id === 50) resolve(m.result); };
  });
  console.log('ERRORES (' + errors.length + '):');
  for (const e of errors.slice(0, 8)) console.log(JSON.stringify(e, null, 1).slice(0, 600));
  console.log('DOM:', last && last.result ? last.result.value : last);
  ws.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
