/* ============================================================
   Ceará em Dados — controle da interface do chat
   · fluxo padrão: NLU local (zero configuração)
   · fluxo opcional: reescrita da resposta via API do Gemini,
     usando a resposta estruturada do NLU como contexto
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
  const reescreverComGemini = async (pergunta, respostaLocal) => {
    const key = getApiKey();
    if (!key) return null;

    const contexto = respostaLocal.texto.replace(/<[^>]+>/g, "");
    const prompt =
      `Você é o assistente do "Ceará em Dados", um chatbot sobre dados públicos do Ceará. ` +
      `O usuário perguntou: "${pergunta}". O sistema local encontrou esta resposta nos dados: ` +
      `"${contexto}". Reescreva a resposta em português brasileiro, em no máximo 3 frases, ` +
      `de forma amigável e informativa, mantendo TODOS os números exatamente como estão. ` +
      `Não invente dados. Responda apenas com o texto final, sem markdown.`;

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
      const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return texto || null;
    } catch {
      return null; // falha de rede/chave → segue com a resposta local
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

    const resposta = NLU.responder(pergunta);

    // tenta enriquecer o texto com o Gemini, se configurado
    const textoGemini = await reescreverComGemini(pergunta, resposta);
    const badge = textoGemini
      ? '<span class="src">✨ resposta refinada pela API do Gemini</span>'
      : "";

    typing.innerHTML = (textoGemini || resposta.texto) + badge;

    if (resposta.grafico) CHARTS.renderizar(typing, resposta.grafico);
    if (resposta.stat) addStat(typing, resposta.stat);

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

  // ---------- mensagem de boas-vindas ----------
  addBot(
    `Olá! 👋 Sou o assistente do <strong>Ceará em Dados</strong>. Pergunte em português sobre ` +
      `<strong>população, PIB, IDH, IDEB, desemprego, área e densidade</strong> dos municípios ` +
      `cearenses — eu respondo com números e gráficos. Experimente as sugestões abaixo ou digite ` +
      `<em>"ajuda"</em> para ver exemplos. 🚀`
  );
})();
