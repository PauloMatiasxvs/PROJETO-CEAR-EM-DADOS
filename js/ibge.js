/* ============================================================
   Ceará em Dados — integração com as APIs abertas do IBGE
   · População dos 184 municípios (Censo 2022, agregado 4709)
   · Nomes/códigos dos municípios (API de localidades)
   · Malha territorial em GeoJSON (API de malhas) para o mapa
   Tudo com cache em localStorage e fallback silencioso para a
   base embutida (o app funciona offline com os 12 maiores).
   ============================================================ */

const IBGE = (() => {
  const BASE = "https://servicodados.ibge.gov.br/api";
  const URL_POPULACAO = `${BASE}/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6%5BN3%5B23%5D%5D`;
  const URL_LOCALIDADES = `${BASE}/v1/localidades/estados/23/municipios?orderBy=nome`;
  const URL_MALHA = `${BASE}/v3/malhas/estados/23?formato=application%2Fvnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`;

  // cópias baixadas no deploy e publicadas junto com o site
  // (ver .github/workflows/deploy.yml) — carregam sem depender da API
  const LOCAL_POPULACAO = "dados/populacao.json";
  const LOCAL_LOCALIDADES = "dados/localidades.json";
  const LOCAL_MALHA = "dados/malha.json";

  const TTL = 7 * 24 * 3600 * 1000; // 7 dias

  let carregado = false; // true quando os 184 municípios entraram na base

  // ---------- cache ----------
  const cacheLer = (chave) => {
    try {
      const bruto = localStorage.getItem(chave);
      if (!bruto) return null;
      const { t, dados } = JSON.parse(bruto);
      return Date.now() - t < TTL ? dados : null;
    } catch {
      return null;
    }
  };

  const cacheGravar = (chave, dados) => {
    try {
      localStorage.setItem(chave, JSON.stringify({ t: Date.now(), dados }));
    } catch {
      /* cache cheio ou indisponível — segue sem cache */
    }
  };

  const baixarJson = async (url) => {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`IBGE respondeu ${resp.status}`);
    return resp.json();
  };

  // tenta primeiro a cópia local publicada com o site; se não existir
  // (ex.: rodando da main sem build), cai para a API ao vivo do IBGE
  const baixarComFallback = async (urlLocal, urlApi) => {
    try {
      const resp = await fetch(urlLocal, { headers: { Accept: "application/json" } });
      if (resp.ok) return await resp.json();
    } catch {
      /* segue para a API */
    }
    return baixarJson(urlApi);
  };

  // remove sufixo de UF que a API às vezes inclui: "Fortaleza (CE)" / "Fortaleza - CE"
  const limparNome = (nome) =>
    String(nome).replace(/\s*\(\w{2}\)\s*$/, "").replace(/\s*-\s*\w{2}\s*$/, "").trim();

  // ---------- população dos 184 municípios ----------
  const extrairSeries = (json) => {
    // formato v3: [{ resultados: [{ series: [{ localidade: {id, nome}, serie: {"2022": "123"} }] }] }]
    const series = json?.[0]?.resultados?.[0]?.series;
    if (!Array.isArray(series)) throw new Error("formato inesperado da API de agregados");
    return series
      .map((s) => {
        const valores = Object.values(s?.serie || {});
        const populacao = Number(valores[valores.length - 1]);
        return {
          codigo: String(s?.localidade?.id || ""),
          nome: limparNome(s?.localidade?.nome || ""),
          populacao,
        };
      })
      .filter((m) => m.nome && Number.isFinite(m.populacao) && m.populacao > 0);
  };

  const mesclarNaBase = (municipiosApi) => {
    const porNome = new Map(
      CE_DATA.municipios.map((m) => [NLU.normalizar(m.nome), m])
    );
    for (const api of municipiosApi) {
      const chave = NLU.normalizar(api.nome);
      const existente = porNome.get(chave);
      if (existente) {
        // enriquece os 12 embutidos com o código IBGE (necessário para o mapa)
        existente.codigo = api.codigo;
      } else {
        CE_DATA.municipios.push({ nome: api.nome, populacao: api.populacao, codigo: api.codigo });
      }
    }
    CE_DATA.municipios.sort((a, b) => b.populacao - a.populacao);
    CE_DATA.municipios.forEach((m) => {
      if (m.area) m.densidade = m.populacao / m.area;
    });
    carregado = true;
  };

  const carregarPopulacao = async () => {
    const emCache = cacheLer("ce-ibge-populacao");
    if (emCache) {
      mesclarNaBase(emCache);
      return;
    }
    const json = await baixarComFallback(LOCAL_POPULACAO, URL_POPULACAO);
    const municipios = extrairSeries(json);
    if (municipios.length < 100) throw new Error("API devolveu menos municípios que o esperado");
    cacheGravar("ce-ibge-populacao", municipios);
    mesclarNaBase(municipios);
  };

  // ---------- localidades (código → nome), usado pelo mapa ----------
  const carregarLocalidades = async () => {
    const emCache = cacheLer("ce-ibge-localidades");
    if (emCache) return emCache;
    const json = await baixarComFallback(LOCAL_LOCALIDADES, URL_LOCALIDADES);
    if (!Array.isArray(json)) throw new Error("formato inesperado da API de localidades");
    const mapa = {};
    for (const m of json) mapa[String(m.id)] = limparNome(m.nome);
    cacheGravar("ce-ibge-localidades", mapa);
    return mapa;
  };

  // ---------- malha territorial (GeoJSON) ----------
  const carregarMalha = async () => {
    const emCache = cacheLer("ce-ibge-malha");
    if (emCache) return emCache;
    const geo = await baixarComFallback(LOCAL_MALHA, URL_MALHA);
    if (!Array.isArray(geo?.features)) throw new Error("formato inesperado da API de malhas");
    cacheGravar("ce-ibge-malha", geo);
    return geo;
  };

  // ---------- inicialização silenciosa ----------
  const iniciar = () => {
    carregarPopulacao().catch(() => {
      /* sem rede ou API fora do ar: o app segue com os 12 embutidos */
    });
  };

  return {
    iniciar,
    carregarMalha,
    carregarLocalidades,
    get carregado() {
      return carregado;
    },
  };
})();
