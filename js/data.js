/* ============================================================
   Ceará em Dados — base de dados embutida
   Valores consolidados a partir de fontes públicas:
   · IBGE — Censo Demográfico 2022, PIB dos Municípios 2021,
     PNAD Contínua
   · Atlas Brasil (PNUD) — IDHM 2010
   · INEP — IDEB (anos iniciais, rede pública)
   Alguns valores são aproximados para fins de demonstração.
   ============================================================ */

const CE_DATA = {
  // ---------- Municípios (12 mais populosos, Censo 2022) ----------
  municipios: [
    { nome: "Fortaleza",          populacao: 2428708, idhm: 0.754, pibPerCapita: 29320, area: 312.4 },
    { nome: "Caucaia",            populacao: 355679,  idhm: 0.682, pibPerCapita: 20110, area: 1227.9 },
    { nome: "Juazeiro do Norte",  populacao: 286120,  idhm: 0.694, pibPerCapita: 19890, area: 258.8 },
    { nome: "Maracanaú",          populacao: 229458,  idhm: 0.686, pibPerCapita: 44160, area: 105.7 },
    { nome: "Sobral",             populacao: 203682,  idhm: 0.714, pibPerCapita: 25840, area: 2122.9 },
    { nome: "Crato",              populacao: 131368,  idhm: 0.713, pibPerCapita: 17310, area: 1176.5 },
    { nome: "Itapipoca",          populacao: 126316,  idhm: 0.640, pibPerCapita: 12480, area: 1614.2 },
    { nome: "Maranguape",         populacao: 105093,  idhm: 0.659, pibPerCapita: 14950, area: 583.1 },
    { nome: "Iguatu",             populacao: 100381,  idhm: 0.677, pibPerCapita: 17820, area: 1029.2 },
    { nome: "Quixadá",            populacao: 85351,   idhm: 0.659, pibPerCapita: 14210, area: 2019.8 },
    { nome: "Pacatuba",           populacao: 82729,   idhm: 0.675, pibPerCapita: 15630, area: 131.9 },
    { nome: "Crateús",            populacao: 74271,   idhm: 0.644, pibPerCapita: 13470, area: 2985.1 },
  ],

  // ---------- Séries temporais do estado ----------
  series: {
    populacaoEstado: {
      titulo: "População do Ceará",
      unidade: "habitantes",
      fonte: "IBGE — Censos Demográficos",
      pontos: [
        { ano: 1980, valor: 5288253 },
        { ano: 1991, valor: 6366647 },
        { ano: 2000, valor: 7430661 },
        { ano: 2010, valor: 8452381 },
        { ano: 2022, valor: 8794957 },
      ],
    },
    pibEstado: {
      titulo: "PIB do Ceará",
      unidade: "R$ bilhões (valores correntes)",
      fonte: "IBGE — Contas Regionais (valores aproximados)",
      pontos: [
        { ano: 2010, valor: 77.9 },
        { ano: 2013, valor: 108.8 },
        { ano: 2015, valor: 130.6 },
        { ano: 2017, valor: 147.9 },
        { ano: 2019, valor: 166.9 },
        { ano: 2021, valor: 194.1 },
      ],
    },
    desemprego: {
      titulo: "Taxa de desocupação no Ceará",
      unidade: "% da força de trabalho (4º trimestre)",
      fonte: "IBGE — PNAD Contínua (valores aproximados)",
      pontos: [
        { ano: 2016, valor: 12.6 },
        { ano: 2017, valor: 12.4 },
        { ano: 2018, valor: 11.2 },
        { ano: 2019, valor: 11.0 },
        { ano: 2020, valor: 14.7 },
        { ano: 2021, valor: 12.9 },
        { ano: 2022, valor: 9.5 },
        { ano: 2023, valor: 8.4 },
      ],
    },
    ideb: {
      titulo: "IDEB do Ceará — anos iniciais (rede pública)",
      unidade: "nota (0 a 10)",
      fonte: "INEP — IDEB (valores aproximados)",
      pontos: [
        { ano: 2005, valor: 3.2 },
        { ano: 2009, valor: 4.4 },
        { ano: 2013, valor: 5.0 },
        { ano: 2017, valor: 6.0 },
        { ano: 2021, valor: 5.9 },
        { ano: 2023, valor: 6.0 },
      ],
    },
  },

  // ---------- Metadados dos indicadores municipais ----------
  indicadores: {
    populacao:    { rotulo: "População",          artigo: "A",  unidade: "habitantes",  fonte: "IBGE — Censo 2022",                       formato: "inteiro" },
    idhm:         { rotulo: "IDHM",               artigo: "O",  unidade: "índice (0 a 1)", fonte: "Atlas Brasil / PNUD — IDHM 2010",      formato: "indice" },
    pibPerCapita: { rotulo: "PIB per capita",     artigo: "O",  unidade: "R$/habitante", fonte: "IBGE — PIB dos Municípios 2021 (aprox.)", formato: "moeda" },
    area:         { rotulo: "Área territorial",   artigo: "A",  unidade: "km²",          fonte: "IBGE — Malha territorial",                formato: "decimal" },
    densidade:    { rotulo: "Densidade demográfica", artigo: "A", unidade: "hab/km²",    fonte: "IBGE — Censo 2022 / Malha territorial",   formato: "decimal" },
  },
};

// densidade calculada a partir de população e área
CE_DATA.municipios.forEach((m) => {
  m.densidade = m.populacao / m.area;
});
