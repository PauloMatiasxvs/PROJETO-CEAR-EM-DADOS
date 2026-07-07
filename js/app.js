/* ============================================================
   Ceará em Dados — controle da interface do chat
   · fluxo padrão: NLU local (zero configuração)
   · com chave do Gemini configurada:
     - pergunta entendida → o LLM só refina o texto da resposta
     - pergunta NÃO entendida → o LLM interpreta e devolve uma
       intenção estruturada em JSON, que é executada sobre a
       base local (os números nunca vêm do modelo)
   ============================================================ */

(() => {
  const chat = document.getElementById("chat");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const chips = document.getElementById("chips");

  const modal = document.getElementById("settings-modal");
  const apiKeyInput = document.getElementById("api-key-input");

  const KEY_STORAGE = "ceara-dados-gemini-key";
  const getApiKey = () => localStorage.getItem(KEY_STORAGE) || "";

  // ---------- helpers de UI ----------
  const rolarParaFim = () => (chat.scrollTop = chat.scrollHeight);

  const addUser = (texto) => {
    const el = document.createElement("div");
    el.className = "msg msg-user";
    el.textContent = texto;
    chat.appendChild(el);
    rolarParaFim();
  };

  const addBot = (html) => {
    const el = document.createElement("div");
    el.className = "msg msg-bot";
    el.innerHTML = html;
    chat.appendChild(el);
    rolarParaFim();
    return el;
  };

  const addTyping = () => {
    const el = addBot('<span class="typing"><span></span><span></span><span></span></span>');
    return el;
  };

  const addStat = (container, stat) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-label">${stat.rotulo}</div>
      <div class="stat-value">${stat.valor}</div>
      <div class="stat-note">${stat.nota}</div>
    `;
    container.appendChild(card);
  };

  // ---------- Gemini (opcional) ----------
  const chamarGemini = async (prompt) => {
    const key = getApiKey();
    if (!key) return null;
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
      return null; // falha de rede/chave → segue com a resposta local
    }
  };

  // refina o texto de uma resposta já entendida
  const refinarComGemini = async (pergunta, respostaLocal) => {
    const contexto = respostaLocal.texto.replace(/<[^>]+>/g, "");
    return chamarGemini(
      `Você é o assistente do "Ceará em Dados", um chatbot sobre dados públicos do Ceará. ` +
        `O usuário perguntou: "${pergunta}". O sistema local encontrou esta resposta nos dados: ` +
        `"${contexto}". Reescreva a resposta em português brasileiro, em no máximo 3 frases, ` +
        `de forma amigável e informativa, mantendo TODOS os números exatamente como estão. ` +
        `Não invente dados. Responda apenas com o texto final, sem markdown.`
    );
  };

  // pergunta não entendida → pede ao LLM uma intenção estruturada
  const interpretarComGemini = async (pergunta) => {
    const bruto = await chamarGemini(
      `Você interpreta perguntas sobre dados públicos do Ceará e responde SOMENTE com JSON válido, ` +
        `sem markdown e sem texto extra, neste formato: ` +
        `{"intencao":"valor|ranking|comparacao|evolucao|mapa","municipios":["Nome"],` +
        `"indicador":"populacao|pib|pibPerCapita|idhm|ideb|desemprego|area|densidade",` +
        `"topN":10,"menores":false}. ` +
        `Regras: "municipios" só com municípios do Ceará citados (pode ficar vazio); ` +
        `"evolucao" é para séries históricas do estado; "mapa" quando pedirem mapa; ` +
        `se não der para interpretar, responda {"intencao":"desconhecida"}. ` +
        `Pergunta: "${pergunta}"`
    );
    if (!bruto) return null;
    try {
      const json = JSON.parse(bruto.replace(/^```json?\s*/i, "").replace(/```\s*$/, ""));
      if (!json || json.intencao === "desconhecida") return null;
      return NLU.executar(json);
    } catch {
      return null;
    }
  };

  // ---------- fluxo principal ----------
  let processando = false;

  const perguntar = async (pergunta) => {
    if (processando || !pergunta.trim()) return;
    processando = true;

    addUser(pergunta);
    input.value = "";

    const typing = addTyping();
    // pequena pausa para a resposta não parecer instantânea demais
    await new Promise((r) => setTimeout(r, 450));

    let resposta = NLU.responder(pergunta);
    let badge = "";

    if (resposta.fallback) {
      // o motor local não entendeu — tenta o Gemini como interpretador
      const interpretada = await interpretarComGemini(pergunta);
      if (interpretada) {
        resposta = interpretada;
        badge = '<span class="src">✨ pergunta interpretada com ajuda da API do Gemini</span>';
      }
    } else {
      const refinado = await refinarComGemini(pergunta, resposta);
      if (refinado) {
        resposta = { ...resposta, texto: refinado };
        badge = '<span class="src">✨ resposta refinada pela API do Gemini</span>';
      }
    }

    typing.innerHTML = resposta.texto + badge;

    if (resposta.grafico) CHARTS.renderizar(typing, resposta.grafico);
    if (resposta.stat) addStat(typing, resposta.stat);
    if (resposta.mapa) await MAPA.renderizar(typing, resposta.mapa.indicador);

    rolarParaFim();
    processando = false;
  };

  // ---------- eventos ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    perguntar(input.value);
  });

  chips.addEventListener("click", (e) => {
    if (e.target.classList.contains("chip")) perguntar(e.target.textContent);
  });

  // modal de configuração
  document.getElementById("btn-settings").addEventListener("click", () => {
    apiKeyInput.value = getApiKey();
    modal.showModal();
  });
  document.getElementById("btn-close-modal").addEventListener("click", () => modal.close());
  document.getElementById("btn-save-key").addEventListener("click", () => {
    const k = apiKeyInput.value.trim();
    if (k) localStorage.setItem(KEY_STORAGE, k);
    modal.close();
  });
  document.getElementById("btn-clear-key").addEventListener("click", () => {
    localStorage.removeItem(KEY_STORAGE);
    apiKeyInput.value = "";
  });

  // ---------- inicialização ----------
  IBGE.iniciar(); // carrega os 184 municípios em segundo plano

  addBot(
    `Olá! 👋 Sou o assistente do <strong>Ceará em Dados</strong>. Pergunte em português sobre ` +
      `<strong>população, PIB, IDH, IDEB, desemprego, área e densidade</strong> dos municípios ` +
      `cearenses — eu respondo com números, gráficos e até <strong>mapa</strong>. Pode emendar ` +
      `perguntas ("qual a população de Sobral?" → "e o IDH?") e não se preocupe com erro de ` +
      `digitação. Experimente as sugestões abaixo ou digite <em>"ajuda"</em>. 🚀`
  );
})();
