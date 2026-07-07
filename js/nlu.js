/* ============================================================
   Ceará em Dados — motor de linguagem natural (NLU)
   Roda 100% no navegador, sem dependências externas:
   1. normaliza o texto (minúsculas, sem acentos)
   2. extrai entidades (municípios) por dicionário
   3. detecta o indicador (população, PIB, IDHM…)
   4. classifica a intenção (valor, ranking, comparação, evolução)
   5. devolve uma "resposta estruturada" que a UI transforma
      em texto + gráfico
   ============================================================ */

const NLU = (() => {
  // ---------- utilidades ----------
  const normalizar = (t) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[?!.,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const fmtInteiro = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const fmtDecimal = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const fmtMoeda = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtIndice = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 3 });

  const formatar = (valor, formato) =>
    ({ inteiro: fmtInteiro, decimal: fmtDecimal, moeda: fmtMoeda, indice: fmtIndice }[formato] ||
      fmtDecimal)(valor);

  // ---------- dicionários ----------
  const INDICADORES = [
    { chave: "populacao",    termos: ["populacao", "habitantes", "populosos", "populoso", "moradores", "gente", "pessoas"] },
    { chave: "pibPerCapita", termos: ["pib per capita", "renda per capita", "pib por habitante"] },
    { chave: "pib",          termos: ["pib", "economia", "produto interno", "riqueza"] },
    { chave: "idhm",         termos: ["idhm", "idh", "desenvolvimento humano"] },
    { chave: "ideb",         termos: ["ideb", "educacao", "ensino", "escolas", "escolar"] },
    { chave: "desemprego",   termos: ["desemprego", "desocupacao", "emprego", "trabalho", "desempregados"] },
    { chave: "area",         termos: ["area", "territorio", "tamanho", "extensao", "km2", "maiores em area"] },
    { chave: "densidade",    termos: ["densidade", "hab/km", "habitantes por km"] },
  ];

  const SERIES_ESTADO = { pib: "pibEstado", desemprego: "desemprego", ideb: "ideb", populacao: "populacaoEstado" };

  const TERMOS_EVOLUCAO   = ["evolucao", "historico", "ao longo", "serie", "crescimento", "variacao", "como esta", "tendencia", "anos", "decada"];
  const TERMOS_RANKING    = ["top", "maiores", "menores", "ranking", "mais populosos", "lista", "quais os", "quais sao", "melhores", "piores", "mais ricos"];
  const TERMOS_COMPARACAO = ["compare", "comparacao", "comparar", " x ", " vs ", "versus", "diferenca entre", " ou "];
  const TERMOS_AJUDA      = ["ajuda", "help", "o que voce faz", "o que voce sabe", "como usar", "exemplos"];
  const TERMOS_SAUDACAO   = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "hey", "salve"];
  const TERMOS_SOBRE      = ["quem e voce", "o que e isso", "sobre o projeto", "quem te fez", "quem criou"];

  // ---------- extração de entidades ----------
  const buscarMunicipios = (texto) => {
    const achados = [];
    for (const m of CE_DATA.municipios) {
      const nomeNorm = normalizar(m.nome);
      const idx = texto.indexOf(nomeNorm);
      if (idx !== -1) achados.push({ municipio: m, pos: idx });
    }
    // ordena pela posição em que aparecem na frase
    return achados.sort((a, b) => a.pos - b.pos).map((a) => a.municipio);
  };

  const buscarIndicador = (texto) => {
    for (const ind of INDICADORES) {
      if (ind.termos.some((t) => texto.includes(t))) return ind.chave;
    }
    return null;
  };

  const contemAlgum = (texto, termos) => termos.some((t) => texto.includes(t));

  const extrairTopN = (texto) => {
    const m = texto.match(/top\s*(\d+)|(\d+)\s*(maiores|menores|municipios|mais)/);
    if (m) {
      const n = parseInt(m[1] || m[2], 10);
      if (n >= 2 && n <= 12) return n;
    }
    return 10;
  };

  // ---------- construtores de resposta ----------
  const respostaSerie = (chaveSerie) => {
    const s = CE_DATA.series[chaveSerie];
    const primeiro = s.pontos[0];
    const ultimo = s.pontos[s.pontos.length - 1];
    const variacao = (((ultimo.valor - primeiro.valor) / primeiro.valor) * 100).toFixed(1).replace(".", ",");
    const subiu = ultimo.valor >= primeiro.valor;

    return {
      texto:
        `<strong>${s.titulo}</strong>: entre ${primeiro.ano} e ${ultimo.ano}, o indicador ` +
        `${subiu ? "subiu" : "caiu"} de <strong>${fmtDecimal(primeiro.valor)}</strong> para ` +
        `<strong>${fmtDecimal(ultimo.valor)}</strong> ${s.unidade} ` +
        `(variação de ${subiu ? "+" : ""}${variacao}%). Veja a evolução no gráfico:`,
      grafico: {
        tipo: "linha",
        titulo: s.titulo,
        subtitulo: s.unidade,
        rotulos: s.pontos.map((p) => p.ano),
        valores: s.pontos.map((p) => p.valor),
        fonte: s.fonte,
      },
    };
  };

  const respostaValor = (municipio, indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    const valor = municipio[indicador];
    const rank =
      [...CE_DATA.municipios].sort((a, b) => b[indicador] - a[indicador]).findIndex((m) => m.nome === municipio.nome) + 1;

    const rotuloTxt = ["IDHM", "PIB per capita"].includes(meta.rotulo) ? meta.rotulo : meta.rotulo.toLowerCase();
    return {
      texto:
        `${meta.artigo} <strong>${rotuloTxt}</strong> de <strong>${municipio.nome}</strong> é ` +
        `<strong>${formatar(valor, meta.formato)}</strong> ${meta.unidade !== "habitantes" ? `(${meta.unidade})` : ""} — ` +
        `${rank}º lugar entre os 12 municípios mais populosos do Ceará na base deste projeto.`,
      stat: {
        rotulo: `${meta.rotulo} — ${municipio.nome}`,
        valor: formatar(valor, meta.formato),
        nota: `${rank}º entre os 12 maiores municípios · ${meta.fonte}`,
      },
    };
  };

  const respostaRanking = (indicador, n, menores = false) => {
    const meta = CE_DATA.indicadores[indicador];
    const ordenados = [...CE_DATA.municipios].sort((a, b) =>
      menores ? a[indicador] - b[indicador] : b[indicador] - a[indicador]
    );
    const top = ordenados.slice(0, n);
    const lider = top[0];

    return {
      texto:
        `${menores ? "Menores" : "Maiores"} municípios do Ceará em <strong>${meta.rotulo.toLowerCase()}</strong> ` +
        `(entre os 12 mais populosos): <strong>${lider.nome}</strong> ${menores ? "tem o menor valor, com" : "lidera com"} ` +
        `<strong>${formatar(lider[indicador], meta.formato)}</strong>. Confira o ranking:`,
      grafico: {
        tipo: "barra",
        titulo: `${menores ? "Menores" : "Top"} ${n} — ${meta.rotulo}`,
        subtitulo: meta.unidade,
        rotulos: top.map((m) => m.nome),
        valores: top.map((m) => m[indicador]),
        fonte: meta.fonte,
      },
    };
  };

  const respostaComparacao = (municipios, indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    const [a, b] = municipios;
    const maior = a[indicador] >= b[indicador] ? a : b;
    const menor = maior === a ? b : a;
    const razao = (maior[indicador] / menor[indicador]).toFixed(1).replace(".", ",");

    return {
      texto:
        `Comparando <strong>${meta.rotulo.toLowerCase()}</strong>: <strong>${maior.nome}</strong> ` +
        `(${formatar(maior[indicador], meta.formato)}) supera <strong>${menor.nome}</strong> ` +
        `(${formatar(menor[indicador], meta.formato)}) — cerca de ${razao}x. Veja lado a lado:`,
      grafico: {
        tipo: "barra",
        titulo: `${meta.rotulo}: ${municipios.map((m) => m.nome).join(" × ")}`,
        subtitulo: meta.unidade,
        rotulos: municipios.map((m) => m.nome),
        valores: municipios.map((m) => m[indicador]),
        fonte: meta.fonte,
      },
    };
  };

  const respostaAjuda = () => ({
    texto:
      `Eu respondo perguntas sobre <strong>dados públicos do Ceará</strong> com texto e gráficos. Experimente:<br><br>` +
      `📌 <strong>Valor</strong> — "qual a população de Fortaleza?"<br>` +
      `🏆 <strong>Ranking</strong> — "top 5 municípios em IDH"<br>` +
      `⚖️ <strong>Comparação</strong> — "compare Sobral e Crato"<br>` +
      `📈 <strong>Evolução</strong> — "evolução do PIB do Ceará"<br><br>` +
      `Indicadores disponíveis: população, PIB, PIB per capita, IDHM, IDEB, desemprego, área e densidade.`,
  });

  const respostaSaudacao = () => ({
    texto:
      `Olá! 👋 Sou o assistente do <strong>Ceará em Dados</strong>. Pergunte qualquer coisa sobre os ` +
      `municípios cearenses — por exemplo, <em>"top 10 municípios mais populosos"</em> ou ` +
      `<em>"evolução do desemprego no Ceará"</em>.`,
  });

  const respostaSobre = () => ({
    texto:
      `Sou um chatbot de <strong>análise de dados públicos do Ceará</strong>. Meu motor de linguagem ` +
      `natural roda 100% no navegador: normalizo sua pergunta, extraio municípios e indicadores por ` +
      `dicionário, classifico a intenção e gero a resposta com gráfico. Também posso usar a API do ` +
      `Gemini para respostas mais elaboradas (botão ⚙️ no topo). Código aberto no GitHub!`,
  });

  const respostaFallback = () => ({
    texto:
      `Hmm, não entendi essa. 🤔 Tente algo como <em>"qual o PIB per capita de Maracanaú?"</em>, ` +
      `<em>"top 5 em densidade"</em> ou <em>"evolução do IDEB"</em>. Digite <strong>ajuda</strong> ` +
      `para ver tudo que eu sei fazer.`,
  });

  // ---------- pipeline principal ----------
  const responder = (pergunta) => {
    const texto = " " + normalizar(pergunta) + " ";

    if (contemAlgum(texto, TERMOS_AJUDA)) return respostaAjuda();
    if (contemAlgum(texto, TERMOS_SOBRE)) return respostaSobre();

    const municipios = buscarMunicipios(texto);
    let indicador = buscarIndicador(texto);
    const querEvolucao = contemAlgum(texto, TERMOS_EVOLUCAO);
    const querRanking = contemAlgum(texto, TERMOS_RANKING);
    const querComparar = contemAlgum(texto, TERMOS_COMPARACAO) || municipios.length >= 2;

    // saudação pura (sem entidade nem indicador)
    if (!municipios.length && !indicador && contemAlgum(texto, TERMOS_SAUDACAO)) return respostaSaudacao();

    // séries do estado: "evolução do PIB", "como está o desemprego"
    if (indicador && SERIES_ESTADO[indicador] && !municipios.length) {
      const soEstado = ["desemprego", "ideb"].includes(indicador);
      if (querEvolucao || soEstado || (texto.includes("ceara") && !querRanking)) {
        return respostaSerie(SERIES_ESTADO[indicador]);
      }
    }

    // "pib" municipal não existe na base — cai para per capita
    if (indicador === "pib") indicador = "pibPerCapita";
    if (indicador === "ideb" || indicador === "desemprego") {
      return respostaSerie(SERIES_ESTADO[indicador]);
    }

    // comparação entre 2+ municípios
    if (querComparar && municipios.length >= 2) {
      return respostaComparacao(municipios.slice(0, 4), indicador || "populacao");
    }

    // ranking
    if (querRanking) {
      const menores = texto.includes("menores") || texto.includes("piores");
      return respostaRanking(indicador || "populacao", extrairTopN(texto), menores);
    }

    // valor pontual de um município
    if (municipios.length === 1) {
      return respostaValor(municipios[0], indicador || "populacao");
    }

    // indicador sem município → ranking geral ou série
    if (indicador) {
      if (SERIES_ESTADO[indicador] && querEvolucao) return respostaSerie(SERIES_ESTADO[indicador]);
      return respostaRanking(indicador, 10, false);
    }

    return respostaFallback();
  };

  return { responder, normalizar };
})();
