/* ============================================================
   Ceará em Dados — motor de linguagem natural (NLU)
   Roda 100% no navegador, sem dependências externas:
   1. normaliza o texto (minúsculas, sem acentos)
   2. extrai entidades (municípios) — casamento exato por
      palavra + casamento aproximado (Levenshtein) p/ erros
      de digitação
   3. detecta o indicador (população, PIB, IDHM…)
   4. classifica a intenção (valor, ranking, comparação,
      evolução, mapa)
   5. lembra o contexto da conversa (último município e
      indicador) para perguntas de continuação: "e o IDH?"
   6. devolve uma "resposta estruturada" que a UI transforma
      em texto + gráfico/mapa
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

  // distância de Levenshtein com teto (para o casamento aproximado)
  const levenshtein = (a, b, teto) => {
    if (Math.abs(a.length - b.length) > teto) return teto + 1;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const atual = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        atual[j] = Math.min(
          anterior[j] + 1,
          atual[j - 1] + 1,
          anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        if (atual[j] < menor) menor = atual[j];
      }
      if (menor > teto) return teto + 1;
      anterior = atual;
    }
    return anterior[b.length];
  };

  const toleranciaPara = (nome) =>
    nome.length <= 4 ? 0 : nome.length <= 6 ? 1 : nome.length <= 10 ? 2 : 3;

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

  // termos longos o bastante para o casamento aproximado sem falso positivo
  const TERMOS_FUZZY_INDICADOR = ["populacao", "habitantes", "desemprego", "densidade", "educacao", "territorio"];

  const SERIES_ESTADO = { pib: "pibEstado", desemprego: "desemprego", ideb: "ideb", populacao: "populacaoEstado" };

  const TERMOS_EVOLUCAO   = ["evolucao", "historico", "ao longo", "serie", "crescimento", "variacao", "como esta", "tendencia", "decada"];
  const TERMOS_RANKING    = ["top", "maiores", "menores", "ranking", "mais populosos", "lista", "quais os", "quais sao", "melhores", "piores", "mais ricos"];
  const TERMOS_COMPARACAO = ["compare", "comparacao", "comparar", " x ", " vs ", "versus", "diferenca entre", " ou "];
  const TERMOS_MAPA       = ["mapa", "mapear", "cartografia", "choropleth", "coropletico"];
  const TERMOS_AJUDA      = ["ajuda", "help", "o que voce faz", "o que voce sabe", "como usar", "exemplos"];
  const TERMOS_SAUDACAO   = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "hey", "salve"];
  const TERMOS_SOBRE      = ["quem e voce", "o que e isso", "sobre o projeto", "quem te fez", "quem criou"];

  const PALAVRAS_COMUNS = new Set([
    "qual", "quais", "como", "onde", "esta", "estao", "para", "pelo", "pela",
    "entre", "sobre", "municipio", "municipios", "cidade", "cidades", "ceara",
    "estado", "compare", "comparar", "evolucao", "mapa", "mostre", "mostra",
    "dados", "grafico", "maior", "menor", "maiores", "menores", "ranking",
  ]);

  // ---------- memória de contexto da conversa ----------
  let memoria = { municipios: [], indicador: null };

  const lembrar = (municipios, indicador) => {
    if (municipios && municipios.length) memoria.municipios = municipios.slice(0, 4);
    if (indicador) memoria.indicador = indicador;
  };

  // ---------- extração de entidades ----------
  const buscarMunicipiosExatos = (texto) => {
    const achados = [];
    for (const m of CE_DATA.municipios) {
      const nomeNorm = normalizar(m.nome);
      const idx = texto.indexOf(` ${nomeNorm} `);
      if (idx !== -1) achados.push({ municipio: m, pos: idx, fim: idx + nomeNorm.length + 1 });
    }
    return achados;
  };

  const buscarMunicipiosFuzzy = (texto, jaAchados) => {
    // todas as palavras da pergunta com suas posições
    const palavras = [];
    const regex = /\S+/g;
    let m;
    while ((m = regex.exec(texto)) !== null) palavras.push({ p: m[0], pos: m.index });

    const ocupado = (pos, fim) => jaAchados.some((a) => pos < a.fim && fim > a.pos);
    const nomesAchados = new Set(jaAchados.map((a) => normalizar(a.municipio.nome)));

    const achados = [];
    for (const municipio of CE_DATA.municipios) {
      const nomeNorm = normalizar(municipio.nome);
      if (nomesAchados.has(nomeNorm)) continue;
      const partes = nomeNorm.split(" ");
      const teto = toleranciaPara(nomeNorm);
      if (teto === 0) continue; // nomes muito curtos: só casamento exato
      let melhor = null;
      for (let i = 0; i + partes.length <= palavras.length; i++) {
        const janela = palavras.slice(i, i + partes.length);
        // a janela precisa começar numa palavra "candidata a nome próprio"
        if (janela[0].p.length < 4 || PALAVRAS_COMUNS.has(janela[0].p)) continue;
        const trecho = janela.map((w) => w.p).join(" ");
        if (trecho.length < 5) continue;
        const pos = janela[0].pos;
        const fim = janela[janela.length - 1].pos + janela[janela.length - 1].p.length;
        if (ocupado(pos, fim)) continue;
        const d = levenshtein(trecho, nomeNorm, teto);
        if (d <= teto && d > 0 && (!melhor || d < melhor.d)) melhor = { d, pos, fim };
      }
      if (melhor) achados.push({ municipio, pos: melhor.pos, fim: melhor.fim, d: melhor.d });
    }
    // em caso de sobreposição entre candidatos aproximados, fica o mais parecido
    achados.sort((a, b) => a.d - b.d);
    const finais = [];
    for (const c of achados) {
      if (!finais.some((f) => c.pos < f.fim && c.fim > f.pos)) finais.push(c);
    }
    return finais;
  };

  const buscarMunicipios = (texto) => {
    const exatos = buscarMunicipiosExatos(texto);
    const aproximados = buscarMunicipiosFuzzy(texto, exatos);
    return [...exatos, ...aproximados]
      .sort((a, b) => a.pos - b.pos)
      .map((a) => a.municipio);
  };

  const buscarIndicador = (texto) => {
    for (const ind of INDICADORES) {
      if (ind.termos.some((t) => texto.includes(t))) return ind.chave;
    }
    // casamento aproximado: "poplação", "desemprgo"…
    const palavras = texto.split(" ").filter((p) => p.length >= 5);
    for (const termo of TERMOS_FUZZY_INDICADOR) {
      for (const p of palavras) {
        if (levenshtein(p, termo, 2) <= (termo.length <= 8 ? 1 : 2)) {
          const dono = INDICADORES.find((i) => i.termos.includes(termo));
          if (dono) return dono.chave;
        }
      }
    }
    return null;
  };

  const contemAlgum = (texto, termos) => termos.some((t) => texto.includes(t));

  const extrairTopN = (texto) => {
    const m = texto.match(/top\s*(\d+)|(\d+)\s*(maiores|menores|municipios|mais)/);
    if (m) {
      const n = parseInt(m[1] || m[2], 10);
      if (n >= 2 && n <= 20) return n;
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

  const comDado = (indicador) =>
    CE_DATA.municipios.filter((m) => Number.isFinite(m[indicador]));

  const descreverBase = (indicador) => {
    const n = comDado(indicador).length;
    const total = CE_DATA.municipios.length;
    if (n === total && total >= 100) return `os ${total} municípios do Ceará`;
    if (n === total) return `os ${total} maiores municípios do Ceará`;
    return `os ${n} municípios com esse dado na base`;
  };

  const respostaValor = (municipio, indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    const valor = municipio[indicador];

    // município fora da base detalhada (ex.: IDH de cidade pequena)
    if (!Number.isFinite(valor)) {
      const pop = Number.isFinite(municipio.populacao)
        ? ` A população de <strong>${municipio.nome}</strong> (Censo 2022) é <strong>${fmtInteiro(municipio.populacao)}</strong> habitantes.`
        : "";
      return {
        texto:
          `Ainda não tenho <strong>${meta.rotulo}</strong> para <strong>${municipio.nome}</strong> — ` +
          `esse indicador está disponível para ${descreverBase(indicador)}.${pop}`,
      };
    }

    const universo = comDado(indicador);
    const rank =
      [...universo].sort((a, b) => b[indicador] - a[indicador]).findIndex((m) => m.nome === municipio.nome) + 1;
    const rotuloTxt = ["IDHM", "PIB per capita"].includes(meta.rotulo) ? meta.rotulo : meta.rotulo.toLowerCase();

    return {
      texto:
        `${meta.artigo} <strong>${rotuloTxt}</strong> de <strong>${municipio.nome}</strong> é ` +
        `<strong>${formatar(valor, meta.formato)}</strong> ${meta.unidade !== "habitantes" ? `(${meta.unidade})` : ""} — ` +
        `${rank}º lugar entre ${descreverBase(indicador)}.`,
      stat: {
        rotulo: `${meta.rotulo} — ${municipio.nome}`,
        valor: formatar(valor, meta.formato),
        nota: `${rank}º entre ${descreverBase(indicador)} · ${meta.fonte}`,
      },
    };
  };

  const respostaRanking = (indicador, n, menores = false) => {
    const meta = CE_DATA.indicadores[indicador];
    const universo = comDado(indicador);
    const ordenados = [...universo].sort((a, b) =>
      menores ? a[indicador] - b[indicador] : b[indicador] - a[indicador]
    );
    const top = ordenados.slice(0, n);
    const lider = top[0];

    return {
      texto:
        `${menores ? "Menores" : "Maiores"} municípios do Ceará em <strong>${meta.rotulo.toLowerCase()}</strong>, ` +
        `entre ${descreverBase(indicador)}: <strong>${lider.nome}</strong> ${menores ? "tem o menor valor, com" : "lidera com"} ` +
        `<strong>${formatar(lider[indicador], meta.formato)}</strong>. Confira o ranking:`,
      grafico: {
        tipo: "barra",
        titulo: `${menores ? "Menores" : "Top"} ${top.length} — ${meta.rotulo}`,
        subtitulo: meta.unidade,
        rotulos: top.map((m) => m.nome),
        valores: top.map((m) => m[indicador]),
        fonte: meta.fonte,
      },
    };
  };

  const respostaComparacao = (municipios, indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    const validos = municipios.filter((m) => Number.isFinite(m[indicador]));
    if (validos.length < 2) return respostaValor(municipios[0], indicador);

    const [a, b] = validos;
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
        titulo: `${meta.rotulo}: ${validos.map((m) => m.nome).join(" × ")}`,
        subtitulo: meta.unidade,
        rotulos: validos.map((m) => m.nome),
        valores: validos.map((m) => m[indicador]),
        fonte: meta.fonte,
      },
    };
  };

  const respostaMapa = (indicador) => {
    const meta = CE_DATA.indicadores[indicador];
    return {
      texto:
        `Aqui está o mapa do Ceará colorido por <strong>${meta.rotulo.toLowerCase()}</strong> ` +
        `(quanto mais escuro, maior o valor). Passe o mouse sobre um município para ver o dado:`,
      mapa: { indicador },
    };
  };

  const respostaAjuda = () => ({
    texto:
      `Eu respondo perguntas sobre <strong>dados públicos do Ceará</strong> com texto, gráficos e mapa. Experimente:<br><br>` +
      `📌 <strong>Valor</strong> — "qual a população de Fortaleza?"<br>` +
      `🏆 <strong>Ranking</strong> — "top 5 municípios em IDH"<br>` +
      `⚖️ <strong>Comparação</strong> — "compare Sobral e Crato"<br>` +
      `📈 <strong>Evolução</strong> — "evolução do PIB do Ceará"<br>` +
      `🗺️ <strong>Mapa</strong> — "mapa da população"<br><br>` +
      `E pode emendar perguntas: depois de "população de Sobral", pergunte só <em>"e o IDH?"</em>. ` +
      `Indicadores: população, PIB, PIB per capita, IDHM, IDEB, desemprego, área e densidade.`,
  });

  const respostaSaudacao = () => ({
    texto:
      `Olá! 👋 Sou o assistente do <strong>Ceará em Dados</strong>. Pergunte qualquer coisa sobre os ` +
      `municípios cearenses — por exemplo, <em>"top 10 municípios mais populosos"</em>, ` +
      `<em>"mapa da população"</em> ou <em>"evolução do desemprego no Ceará"</em>.`,
  });

  const respostaSobre = () => ({
    texto:
      `Sou um chatbot de <strong>análise de dados públicos do Ceará</strong>. Meu motor de linguagem ` +
      `natural roda 100% no navegador: normalizo sua pergunta, extraio municípios e indicadores ` +
      `(com tolerância a erros de digitação), classifico a intenção e gero a resposta com gráfico ou ` +
      `mapa. Os dados dos 184 municípios vêm das APIs abertas do IBGE. Também posso usar a API do ` +
      `Gemini para entender perguntas mais difíceis (botão ⚙️ no topo). Código aberto no GitHub!`,
  });

  const respostaFallback = () => ({
    fallback: true,
    texto:
      `Hmm, não entendi essa. 🤔 Tente algo como <em>"qual o PIB per capita de Maracanaú?"</em>, ` +
      `<em>"mapa da população"</em> ou <em>"evolução do IDEB"</em>. Digite <strong>ajuda</strong> ` +
      `para ver tudo que eu sei fazer.`,
  });

  // ---------- pipeline principal ----------
  const responder = (pergunta) => {
    const texto = " " + normalizar(pergunta) + " ";

    if (contemAlgum(texto, TERMOS_AJUDA)) return respostaAjuda();
    if (contemAlgum(texto, TERMOS_SOBRE)) return respostaSobre();

    let municipios = buscarMunicipios(texto);
    let indicador = buscarIndicador(texto);
    const querEvolucao = contemAlgum(texto, TERMOS_EVOLUCAO);
    const querRanking = contemAlgum(texto, TERMOS_RANKING);
    const querMapa = contemAlgum(texto, TERMOS_MAPA);
    const querComparar = contemAlgum(texto, TERMOS_COMPARACAO) || municipios.length >= 2;
    const falaDoEstado = texto.includes(" ceara ");

    // saudação pura (sem entidade nem indicador)
    if (!municipios.length && !indicador && !querMapa && contemAlgum(texto, TERMOS_SAUDACAO)) {
      return respostaSaudacao();
    }

    // ---- contexto: perguntas de continuação ----
    // "e o IDH?" depois de falar de Sobral → aplica ao último município
    if (
      indicador && !municipios.length && !querRanking && !querEvolucao && !querMapa &&
      !falaDoEstado && !SERIES_ESTADO[indicador] && memoria.municipios.length
    ) {
      municipios = memoria.municipios;
    }
    // "e Quixadá?" depois de perguntar população → aplica o último indicador
    if (municipios.length && !indicador && memoria.indicador) {
      indicador = memoria.indicador;
    }

    // ---- mapa ----
    if (querMapa) {
      const ind = indicador && indicador !== "pib" ? indicador : indicador === "pib" ? "pibPerCapita" : "populacao";
      if (CE_DATA.indicadores[ind]) {
        lembrar(municipios, ind);
        return respostaMapa(ind);
      }
    }

    // séries do estado: "evolução do PIB", "como está o desemprego"
    if (indicador && SERIES_ESTADO[indicador] && !municipios.length) {
      const soEstado = ["desemprego", "ideb"].includes(indicador);
      if (querEvolucao || soEstado || (falaDoEstado && !querRanking)) {
        lembrar([], null);
        return respostaSerie(SERIES_ESTADO[indicador]);
      }
    }

    // "pib" municipal não existe na base — cai para per capita
    if (indicador === "pib") indicador = "pibPerCapita";
    if (indicador === "ideb" || indicador === "desemprego") {
      lembrar([], null);
      return respostaSerie(SERIES_ESTADO[indicador]);
    }

    // comparação entre 2+ municípios
    if (querComparar && municipios.length >= 2) {
      lembrar(municipios, indicador || memoria.indicador || "populacao");
      return respostaComparacao(municipios.slice(0, 4), indicador || memoria.indicador || "populacao");
    }

    // ranking
    if (querRanking) {
      const menores = texto.includes("menores") || texto.includes("piores");
      const ind = indicador || "populacao";
      lembrar([], ind);
      return respostaRanking(ind, extrairTopN(texto), menores);
    }

    // valor pontual de um município
    if (municipios.length === 1) {
      const ind = indicador || memoria.indicador || "populacao";
      lembrar(municipios, ind);
      return respostaValor(municipios[0], ind);
    }

    // indicador sem município → ranking geral ou série
    if (indicador) {
      if (SERIES_ESTADO[indicador] && querEvolucao) {
        lembrar([], null);
        return respostaSerie(SERIES_ESTADO[indicador]);
      }
      lembrar([], indicador);
      return respostaRanking(indicador, 10, false);
    }

    return respostaFallback();
  };

  // ---------- execução de intenção estruturada (usada pelo Gemini) ----------
  const executar = (intencao) => {
    try {
      const ind = CE_DATA.indicadores[intencao.indicador]
        ? intencao.indicador
        : intencao.indicador === "pib"
          ? "pibPerCapita"
          : null;
      const municipios = [];
      for (const nome of intencao.municipios || []) {
        const achados = buscarMunicipios(" " + normalizar(String(nome)) + " ");
        for (const m of achados) if (!municipios.includes(m)) municipios.push(m);
      }

      switch (intencao.intencao) {
        case "evolucao": {
          const chave = SERIES_ESTADO[intencao.indicador] || SERIES_ESTADO[ind];
          if (chave) return respostaSerie(chave);
          break;
        }
        case "mapa":
          if (ind) { lembrar(municipios, ind); return respostaMapa(ind); }
          return respostaMapa("populacao");
        case "comparacao":
          if (municipios.length >= 2) {
            lembrar(municipios, ind || "populacao");
            return respostaComparacao(municipios.slice(0, 4), ind || "populacao");
          }
          break;
        case "ranking": {
          const n = Math.min(Math.max(Number(intencao.topN) || 10, 2), 20);
          lembrar([], ind || "populacao");
          return respostaRanking(ind || "populacao", n, !!intencao.menores);
        }
        case "valor":
          if (municipios.length === 1) {
            lembrar(municipios, ind || "populacao");
            return respostaValor(municipios[0], ind || "populacao");
          }
          if (municipios.length >= 2) {
            lembrar(municipios, ind || "populacao");
            return respostaComparacao(municipios.slice(0, 4), ind || "populacao");
          }
          break;
      }
    } catch {
      /* intenção malformada → devolve null e a UI mantém o fallback */
    }
    return null;
  };

  const limparMemoria = () => {
    memoria = { municipios: [], indicador: null };
  };

  return { responder, executar, normalizar, limparMemoria };
})();
