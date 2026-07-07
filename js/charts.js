/* ============================================================
   Ceará em Dados — renderização de gráficos (Chart.js)
   Especificação visual:
   · barras horizontais para rankings/comparações (nomes longos)
   · linha 2px com marcadores para séries temporais
   · grade recessiva, tinta secundária nos eixos
   · uma série por gráfico → sem legenda (o título nomeia)
   ============================================================ */

const CHARTS = (() => {
  const CORES = {
    serie1: "#3987e5",
    serie1Area: "rgba(57, 135, 229, 0.12)",
    grade: "#2c2c2a",
    eixo: "#898781",
    tinta: "#c3c2b7",
  };

  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.color = CORES.eixo;

  const fmtCompacto = (v) =>
    v >= 1_000_000 ? (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi"
    : v >= 1_000   ? (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  const tooltipBase = {
    backgroundColor: "#232322",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    titleColor: "#ffffff",
    bodyColor: CORES.tinta,
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
    callbacks: {
      label: (ctx) => ` ${(ctx.parsed.x ?? ctx.parsed.y).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`,
    },
  };

  // ---------- gráfico de barras horizontais ----------
  const barra = (canvas, g) =>
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: g.rotulos,
        datasets: [{
          data: g.valores,
          backgroundColor: CORES.serie1,
          borderRadius: 4,
          barThickness: "flex",
          maxBarThickness: 26,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tooltipBase },
        scales: {
          x: {
            grid: { color: CORES.grade, drawTicks: false },
            border: { display: false },
            ticks: { callback: (v) => fmtCompacto(v), maxTicksLimit: 6 },
          },
          y: {
            grid: { display: false },
            border: { color: CORES.grade },
            ticks: { color: CORES.tinta, font: { size: 12 } },
          },
        },
      },
    });

  // ---------- gráfico de linha ----------
  const linha = (canvas, g) =>
    new Chart(canvas, {
      type: "line",
      data: {
        labels: g.rotulos,
        datasets: [{
          data: g.valores,
          borderColor: CORES.serie1,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: CORES.serie1,
          pointBorderColor: "#1a1a19",
          pointBorderWidth: 2,
          fill: true,
          backgroundColor: CORES.serie1Area,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: tooltipBase },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CORES.grade },
            ticks: { color: CORES.tinta },
          },
          y: {
            grid: { color: CORES.grade, drawTicks: false },
            border: { display: false },
            ticks: { callback: (v) => fmtCompacto(v), maxTicksLimit: 6 },
          },
        },
      },
    });

  // ---------- monta o cartão completo dentro da mensagem ----------
  const renderizar = (container, g) => {
    const card = document.createElement("div");
    card.className = "chart-card";
    card.innerHTML = `
      <div class="chart-title">${g.titulo}</div>
      <div class="chart-sub">${g.subtitulo}</div>
      <div class="chart-wrap"><canvas></canvas></div>
      <div class="chart-src">Fonte: ${g.fonte}</div>
    `;
    container.appendChild(card);

    // barras horizontais crescem com o número de itens (rankings grandes)
    if (g.tipo === "barra" && g.rotulos.length > 8) {
      card.querySelector(".chart-wrap").style.height = `${60 + g.rotulos.length * 26}px`;
    }

    const canvas = card.querySelector("canvas");
    if (g.tipo === "linha") linha(canvas, g);
    else barra(canvas, g);
  };

  return { renderizar };
})();
