/* ============================================================
   Ceará em Dados — mapa coroplético do estado
   Desenha a malha municipal do IBGE (GeoJSON) em SVG puro:
   · projeção equirretangular ajustada à latitude média
   · escala sequencial de azuis por quantis (assimetria de
     Fortaleza não "achata" o resto do estado)
   · tooltip ao passar o mouse e legenda com as faixas
   ============================================================ */

const MAPA = (() => {
  // escala sequencial (azul, claro → escuro) validada para o tema
  const ESCALA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab", "#0d366b"];
  const SEM_DADO = "#2c2c2a";

  const fmt = (v) =>
    v >= 1_000_000 ? (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi"
    : v >= 1_000   ? (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  // ---------- projeção ----------
  const coletarPontos = (geom, saida) => {
    const varrer = (coords) => {
      if (typeof coords[0] === "number") saida.push(coords);
      else coords.forEach(varrer);
    };
    varrer(geom.coordinates);
  };

  const criarProjecao = (features, largura, altura, margem) => {
    const pontos = [];
    features.forEach((f) => coletarPontos(f.geometry, pontos));
    const lons = pontos.map((p) => p[0]);
    const lats = pontos.map((p) => p[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    // correção de aspecto pela latitude média (Ceará ≈ -5°)
    const fatorLon = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = (maxLon - minLon) * fatorLon;
    const spanY = maxLat - minLat;
    const escala = Math.min((largura - 2 * margem) / spanX, (altura - 2 * margem) / spanY);
    const dx = (largura - spanX * escala) / 2;
    const dy = (altura - spanY * escala) / 2;
    return ([lon, lat]) => [
      dx + (lon - minLon) * fatorLon * escala,
      dy + (maxLat - lat) * escala, // eixo y invertido
    ];
  };

  const geometriaParaPath = (geom, proj) => {
    const anel = (coords) =>
      coords
        .map((p, i) => {
          const [x, y] = proj(p);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join("") + "Z";
    const poligono = (coords) => coords.map(anel).join("");
    return geom.type === "MultiPolygon"
      ? geom.coordinates.map(poligono).join("")
      : poligono(geom.coordinates);
  };

  // ---------- classificação por quantis ----------
  const criarFaixas = (valores) => {
    const ordenados = [...valores].sort((a, b) => a - b);
    const limites = ESCALA.map((_, i) => {
      const pos = ((i + 1) / ESCALA.length) * (ordenados.length - 1);
      return ordenados[Math.min(Math.round(pos), ordenados.length - 1)];
    });
    return {
      corDe: (v) => {
        for (let i = 0; i < limites.length; i++) if (v <= limites[i]) return ESCALA[i];
        return ESCALA[ESCALA.length - 1];
      },
      limites,
      minimo: ordenados[0],
    };
  };

  // ---------- renderização ----------
  const renderizar = async (container, indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    const card = document.createElement("div");
    card.className = "chart-card";
    card.innerHTML = `
      <div class="chart-title">Mapa do Ceará — ${meta.rotulo}</div>
      <div class="chart-sub">${meta.unidade} · passe o mouse sobre um município</div>
      <div class="map-wrap"><p class="map-status">Carregando a malha do IBGE…</p></div>
      <div class="chart-src">Fontes: ${meta.fonte} · IBGE — API de malhas territoriais</div>
    `;
    container.appendChild(card);
    const wrap = card.querySelector(".map-wrap");

    let malha, localidades;
    try {
      [malha, localidades] = await Promise.all([IBGE.carregarMalha(), IBGE.carregarLocalidades()]);
    } catch {
      wrap.innerHTML =
        '<p class="map-status">Não consegui baixar o mapa do IBGE agora (sem conexão com a API). Tente de novo mais tarde. 🌐</p>';
      return;
    }

    // valor do indicador por código IBGE
    const porNome = new Map(CE_DATA.municipios.map((m) => [NLU.normalizar(m.nome), m]));
    const valorDe = (codigo) => {
      const nome = localidades[String(codigo)];
      if (!nome) return { nome: `Município ${codigo}`, valor: null };
      const municipio = porNome.get(NLU.normalizar(nome));
      const valor = municipio ? municipio[indicador] : null;
      return { nome, valor: Number.isFinite(valor) ? valor : null };
    };

    const comDado = malha.features
      .map((f) => valorDe(f.properties?.codarea).valor)
      .filter((v) => v !== null);
    if (!comDado.length) {
      wrap.innerHTML = '<p class="map-status">Sem dados suficientes para pintar o mapa deste indicador.</p>';
      return;
    }
    const faixas = criarFaixas(comDado);

    const L = 640, A = 560;
    const proj = criarProjecao(malha.features, L, A, 10);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${L} ${A}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Mapa do Ceará colorido por ${meta.rotulo}`);

    const tooltip = document.createElement("div");
    tooltip.className = "map-tooltip";
    tooltip.hidden = true;

    for (const f of malha.features) {
      const { nome, valor } = valorDe(f.properties?.codarea);
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", geometriaParaPath(f.geometry, proj));
      path.setAttribute("fill", valor === null ? SEM_DADO : faixas.corDe(valor));
      path.classList.add("map-municipio");
      path.addEventListener("mousemove", (e) => {
        tooltip.hidden = false;
        tooltip.innerHTML =
          `<strong>${nome}</strong><br>` +
          (valor === null ? "sem dado disponível" : `${meta.rotulo}: ${fmt(valor)}`);
        const box = wrap.getBoundingClientRect();
        tooltip.style.left = `${Math.min(e.clientX - box.left + 14, box.width - 150)}px`;
        tooltip.style.top = `${e.clientY - box.top + 14}px`;
      });
      path.addEventListener("mouseleave", () => (tooltip.hidden = true));
      svg.appendChild(path);
    }

    // legenda com as faixas de quantis
    const legenda = document.createElement("div");
    legenda.className = "map-legend";
    let anterior = faixas.minimo;
    legenda.innerHTML = ESCALA.map((cor, i) => {
      const rotulo = `${fmt(anterior)} – ${fmt(faixas.limites[i])}`;
      anterior = faixas.limites[i];
      return `<span class="map-legend-item"><i style="background:${cor}"></i>${rotulo}</span>`;
    }).join("");

    wrap.innerHTML = "";
    wrap.appendChild(svg);
    wrap.appendChild(tooltip);
    card.insertBefore(legenda, card.querySelector(".chart-src"));
  };

  return { renderizar };
})();
