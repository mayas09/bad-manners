export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bad Manners — this page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root { --bg:#0a0a0a; --ink:#f7f2ea; --muted:#a29a8f; --fire:#ff4b2b; --pink:#ff8ac6; }
      * { box-sizing: border-box; }
      body {
        font: 15px/1.5 "Inter", system-ui, -apple-system, sans-serif;
        background: radial-gradient(120% 80% at 20% 0%, #1a0a10 0%, var(--bg) 60%);
        color: var(--ink);
        display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem;
      }
      .card {
        max-width: 30rem; width: 100%; text-align: center; padding: 2.5rem 2rem;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,138,198,0.18);
        border-radius: 1.25rem;
        backdrop-filter: blur(10px);
      }
      .brand {
        font-family: "Bebas Neue", sans-serif;
        letter-spacing: 0.08em; font-size: 1.5rem; margin-bottom: 1.25rem;
      }
      .brand em { font-style: normal; color: var(--fire); }
      h1 {
        font-family: "Bebas Neue", sans-serif;
        letter-spacing: 0.04em; font-size: 2rem; margin: 0 0 0.75rem;
      }
      p { color: var(--muted); margin: 0 0 1.75rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.7rem 1.25rem; border-radius: 999px; font: 600 14px/1 "Inter", sans-serif;
        cursor: pointer; text-decoration: none; border: 1px solid transparent;
      }
      .primary { background: var(--fire); color: #fff; }
      .primary:hover { filter: brightness(1.08); }
      .secondary { background: transparent; color: var(--ink); border-color: rgba(247,242,234,0.25); }
      .secondary:hover { border-color: var(--pink); color: var(--pink); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">Bad <em>Manners</em></div>
      <h1>This page didn't load</h1>
      <p>Something spilled on our end. Try refreshing, or head back to the shop.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
