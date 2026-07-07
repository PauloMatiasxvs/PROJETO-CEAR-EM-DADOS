# 📊 Ceará em Dados — Chat IA

> Pergunte em **português** sobre dados públicos do Ceará e receba a resposta com **texto + gráfico interativo**, gerados na hora por um motor de linguagem natural que roda 100% no navegador.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat&logo=chartdotjs&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

<p align="center">
  <img src="docs/screenshot-ranking.png" alt="Chat respondendo 'Top 10 municípios mais populosos' com gráfico de barras" width="720" />
</p>

## 💡 O que é

Evolução do projeto **Ceará em Dados**: em vez de dashboards fixos, agora é um **chatbot**. Você digita uma pergunta em linguagem natural — como faria com uma pessoa — e o sistema:

1. **Entende** a pergunta (intenção + entidades + indicador)
2. **Consulta** a base de dados públicos embutida
3. **Responde** com texto explicativo e o **gráfico mais adequado** (barras para rankings e comparações, linha para séries temporais, cartão de destaque para valores pontuais)

### Exemplos de perguntas

| Pergunta | O que acontece |
|---|---|
| *"Qual a população de Fortaleza?"* | Cartão com o número + posição no ranking |
| *"Top 10 municípios mais populosos"* | Gráfico de barras com o ranking |
| *"Compare Sobral e Juazeiro do Norte"* | Barras lado a lado |
| *"Evolução do PIB do Ceará"* | Gráfico de linha 2010–2021 |
| *"Mapa da população"* | Mapa coroplético dos 184 municípios |
| *"e o IDH?"* (depois de perguntar sobre um município) | Continua a conversa pelo contexto |
| *"populaçao de fortalesa"* (com erro de digitação) | Entende mesmo assim ✌️ |

<p align="center">
  <img src="docs/screenshot-evolucao.png" alt="Chat respondendo 'Evolução do desemprego no Ceará' com gráfico de linha" width="720" />
</p>

## 🧠 Como a "IA" funciona

O coração do projeto é um **pipeline de NLU (Natural Language Understanding) escrito do zero em JavaScript puro**, sem nenhuma dependência — roda inteiro no navegador:

```
pergunta → normalização → entidades (exatas + fuzzy) → indicador → intenção → contexto da conversa → resposta estruturada → gráfico/mapa
```

- **Normalização** — minúsculas, remoção de acentos e pontuação
- **Extração de entidades** — casamento por palavra dos 184 municípios + **casamento aproximado** (distância de Levenshtein) para tolerar erros de digitação: "fortalesa", "juazero do norte"…
- **Detecção de indicador** — população, PIB, PIB per capita, IDHM, IDEB, desemprego, área, densidade (também com tolerância a typos)
- **Classificação de intenção** — valor pontual · ranking (com top N dinâmico) · comparação · evolução temporal · **mapa** · ajuda/saudação
- **Contexto de conversa** — o motor lembra o último município e indicador: depois de "população de Sobral?", basta perguntar *"e o IDH?"* ou *"e Quixadá?"*
- **Resposta estruturada** — um objeto `{ texto, grafico | stat | mapa }` que a interface transforma em balão de chat + visualização

### 🌐 Dados ao vivo do IBGE

Ao abrir, o app busca a **população dos 184 municípios do Ceará** (Censo 2022) direto da [API de agregados do IBGE](https://servicodados.ibge.gov.br/api/docs), e o mapa usa a **API de malhas territoriais** (GeoJSON). Tudo com cache em `localStorage` (7 dias) e **fallback offline**: sem conexão, o app segue funcionando com a base embutida dos 12 maiores municípios.

### 🗺️ Mapa coroplético

Peça *"mapa da população"* (ou do IDH, densidade…) e o app desenha a malha municipal do IBGE em **SVG puro** — projeção equirretangular calculada na mão, escala de cores por **quantis** (para a assimetria de Fortaleza não achatar o resto do estado), tooltip por município e legenda com as faixas.

### ✨ Modo IA avançada (opcional)

No botão **⚙️ IA avançada**, dá para colar uma chave gratuita da [API do Google Gemini](https://aistudio.google.com/apikey). O LLM entra em dois papéis:

1. **Pergunta entendida** → ele só **reescreve o texto** da resposta de forma mais natural
2. **Pergunta que o motor local não entendeu** → ele **interpreta e devolve uma intenção estruturada em JSON** (`{intencao, municipios, indicador}`), que é executada sobre a base local — na prática, *function calling*

Nos dois casos **os números vêm sempre da base local** (nada de alucinação de dados), e a chave fica só no `localStorage`. Sem chave, tudo funciona igual: o app **não depende de nenhum serviço para as respostas**.

## 🗂️ Estrutura

```
├── index.html          # estrutura da página (chat, sugestões, modal)
├── css/style.css       # tema escuro, paleta acessível validada p/ daltonismo
├── js/
│   ├── data.js         # base embutida (12 maiores municípios + séries do estado)
│   ├── nlu.js          # motor de linguagem natural (o cérebro)
│   ├── ibge.js         # APIs do IBGE: 184 municípios, malha, cache e fallback
│   ├── charts.js       # renderização dos gráficos (Chart.js)
│   ├── mapa.js         # mapa coroplético do Ceará em SVG puro
│   └── app.js          # controle do chat + integração opcional c/ Gemini
├── vendor/chart.umd.min.js  # Chart.js embutido (funciona offline)
└── docs/               # screenshots
```

## 📚 Fontes dos dados

| Indicador | Fonte |
|---|---|
| População (184 municípios) | IBGE — Censo 2022, via API de agregados (ao vivo) |
| Malha municipal (mapa) | IBGE — API de malhas territoriais (GeoJSON, ao vivo) |
| PIB do estado e PIB per capita | IBGE — Contas Regionais / PIB dos Municípios (valores aproximados) |
| IDHM | Atlas Brasil / PNUD — IDHM 2010 |
| IDEB (anos iniciais, rede pública) | INEP (valores aproximados) |
| Taxa de desocupação | IBGE — PNAD Contínua (valores aproximados) |

> ⚠️ Valores consolidados manualmente para fins de demonstração e portfólio — para uso oficial, consulte sempre as fontes originais.

## 🚀 Como rodar

🔗 **App no ar:** https://paulomatiasxvs.github.io/PROJETO-CEAR-EM-DADOS/

Para rodar localmente, não precisa instalar nada:

```bash
git clone https://github.com/PauloMatiasxvs/PROJETO-CEAR-EM-DADOS.git
cd PROJETO-CEAR-EM-DADOS
# abra o index.html no navegador, ou:
python3 -m http.server 8000   # → http://localhost:8000
```

O deploy no GitHub Pages é automático a cada push na `main` (workflow em `.github/workflows/deploy.yml`).

## 🗺️ Próximos passos

- [x] Todos os 184 municípios do Ceará via API do IBGE
- [x] Mapa coroplético do estado
- [x] Contexto de conversa e tolerância a erros de digitação
- [ ] Mais séries históricas (saúde, segurança, chuvas/FUNCEME)
- [ ] Modo de voz (Web Speech API)
- [ ] Exportar o gráfico como imagem direto do chat

## 📄 Licença

[MIT](LICENSE) — use, estude e adapte à vontade.

---

Feito com 💙 por [Paulo Matias](https://github.com/PauloMatiasxvs) · dados públicos + IA + Ceará 🌵
