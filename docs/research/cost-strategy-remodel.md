# OLYMPUS — Remodelação da Estratégia de Custos (COST-1)

> **Status:** proposta para decisão executiva · **Versão:** v0.0.9 (2026-10-23) · **Licença:** AGPL-3.0-or-later
>
> **Autor:** arquitetura de custos OLYMPUS · **Consumidores:** Apollo (planejamento), Atlas (orquestração), Persephone (telemetria), Hermes (integrações), Artemis (segurança).
>
> Este documento é a base para a decisão de orçamento de IA do OLYMPUS. Ele **não** assume um volume de tráfego: todos os cálculos usam premissas explícitas, e os fatos do briefing que conflitam com as sondagens do repositório estão marcados.

---

## Sumário Executivo

1. O OLYMPUS já opera com nove estratégias (GO, Zen e três free), mas a escolha é **manual por estratégia** — não existe um roteador por workload nem um livro-caixa de limites por provedor.
2. A proposta é uma arquitetura **free-first**: Zen free para codificação, NVIDIA NIM para volume/contexto longo, OpenRouter `:free` para planejamento e baixo volume, e **DeepSeek V4.1 Flash pago apenas como último recurso**.
3. **Achado crítico (probe-first):** a lane `deepseek-ai/deepseek-v4.1-flash` da NVIDIA citada no briefing está **MORTA** nas sondagens deste repositório (timeout de 20s, 2026-10-23; a rotação #191 já a removeu). As lanes NVIDIA verificadas hoje são GLM-5.3, MiniMax M3.1 Flash, Muse Glimmer 30B e GPT-OSS-20B.
4. A lei sagrada do Apollo (GLM, nunca rebaixado) conflita com um roteamento cego para DeepSeek. A recomendação é manter o planejamento em GLM (NVIDIA free → GLM pago) e usar DeepSeek para os demais gods; um modo `cost-first` explícito pode mover Apollo, mas exige aceite do usuário.
5. **Custo headline:** a 500 req/dia, 100% pago em DeepSeek Flash ≈ **US$ 29,55/mês**; a estratégia híbrida 90% free/10% pago ≈ **US$ 2,96/mês**; o plano GO atual custa **US$ 10/mês** (flat).
6. **Payback dos US$ 10 na OpenRouter:** não é uma taxa — é crédito. O desbloqueio (50 → 1.000 req/dia) se paga em economia de fallback em ~**11 dias** a 500 req/dia, ~**5 dias** a 1.000 req/dia e ~**101 dias** a 100 req/dia.
7. **Zen Pro (US$ 9,99/mês):** só compensa se a parcela paga do tráfego passar de ~**34%** a 500 req/dia ou ~**17%** a 1.000 req/dia; a 100 req/dia, nunca compensa contra o DeepSeek pago.
8. **Riscos dominantes:** churn de modelos `-free`, mudança de rate limits, instabilidade dos endpoints, qualidade do roteador aleatório e fuga de gasto pago. Mitigações: probe diário, livro-caixa de limites, ids explícitos (nunca `openrouter/free` em planejamento), cap mensal rígido, telemetria e A/B.
9. **Recomendação:** implementar o COST-1 em 6 fases (livro-caixa → roteador → preset `free-hybrid` → telemetria → benchmark A/B → UAT 24h), mantendo o GO como default de qualidade até o A/B provar paridade.
10. Free tier é **capacidade**, não contrato: a estratégia só é resiliente com fallback explícito e recusa honesta quando todos os limites acabam.

---

## Premissas e dados faltantes

| Premissa | Valor usado | Como obter o dado real |
|---|---|---|
| Volume diário | Cenários de **100, 500 e 1.000 req/dia** | Telemetria `cost.jsonl` + contador de requests por provedor (a implementar no COST-1) |
| Mix de requests | 60% chat (5K in / 1K out), 30% agêntico (20K in / 2K out), 10% documento longo (100K in / 5K out) | Classificador de workload do roteador + amostragem semanal |
| Preço DeepSeek V4.1 Flash | **US$ 0,05 / 1M input** e **US$ 0,60 / 1M output** (OpenRouter 1017, conforme briefing) | Catálogo vivo `~/.cache/opencode/models.json` (`src/lib/model-pricing.ts`); revalidar por provedor |
| Câmbio | US$ 1 = R$ 5,50 (ilustrativo) | Câmbio do dia da decisão; o documento prioriza USD |
| Zen free | 100 req/dia, 128K contexto (briefing) | **Não verificado** neste repositório; exige probe de catálogo + limites antes de wire |
| Zen Pro | US$ 9,99/mês, contexto 200K (briefing) | **Não verificado**; confirmar limites reais e se é ilimitado ou com cap |
| OpenRouter free | 20 RPM; 50 req/dia (conta nova) ou 1.000 req/dia após US$ 10 vitalícios | [Limites oficiais](https://openrouter.ai/docs/api-reference/limits) + probe por conta |
| NVIDIA NIM | 40 RPM, sem limite diário explícito, sandbox sem SLA | [NVIDIA Build](https://build.nvidia.com) + probe de 1 token por lane |
| NVIDIA `deepseek-v4.1-flash` | **MORTA no probe de 2026-10-23** (20s timeout; #191) | Re-probe antes de qualquer wire; não construir sobre ela |
| Apollo sagrado | GLM-5.3 (GO/Zen) e GLM na lane free | `AGENTS.md` + `src/lib/model-strategies.ts`; mudança exige decisão explícita |

> **Regra de ouro:** nenhuma lane entra em produção sem um probe de 1 token verde nas últimas 24h. Um catálogo listar um modelo não prova que ele serve.

---

## Etapa 1 — Matriz de decisão por workload

> **Legenda:** “free verificado” = lane viva no probe deste repositório; “a verificar” = fato do briefing ainda não confirmado; “pago” = último recurso sob cap.

| Workload | Primário (free) | Fallback (free) | Último recurso (pago) | Justificativa técnica | Custo marginal |
|---|---|---|---|---|---|
| **Planejamento / chat de alta frequência (Apollo)** | NVIDIA GLM-5.3 (`nvidia-glm/z-ai/glm-5.3`) — 1M ctx, 200 @ 821-4887ms | OpenRouter `cohere/north-mini-code:free` (o planner comprovado 7/7) | GO/Zen GLM-5.3 (lei sagrada) | Apollo nunca é rebaixado; GLM free é a única lane fiel à lei | **R$ 0,00** (free) |
| **Orquestração / dispatch (Atlas)** | NVIDIA MiniMax M3.1 Flash (`nvidia-minimaxai/...`) — volume, 513-2630ms | OpenRouter `north-mini-code:free` | DeepSeek V4.1 Flash | Orquestração é volume + tool-calling; não precisa de raciocínio profundo | R$ 0,00 |
| **Codificação agêntica (Hephaestus, Athena, Hermes)** | Zen free (codificação curada, 100 req/dia) — **a verificar** | NVIDIA GPT-OSS-20B (`nvidia-openai/openai/gpt-oss-20b`) — code pool verificado | DeepSeek V4.1 Flash (~US$ 2,20/1.000 req agênticas) | Zen é especializado em agentes de código; GPT-OSS é o code anchor NVIDIA | R$ 0,00 → US$ 2,20/1k |
| **Contexto longo / documentos (Persephone, docs)** | NVIDIA com ≥1M ctx **vivo** (GLM-5.3 1M) | OpenRouter modelo free de contexto longo | DeepSeek V4.1 Flash (1M ctx) | O briefing indica `deepseek-v4.1-flash` NVIDIA, mas ela está morta; usar apenas lane viva | R$ 0,00 → US$ 8,00/1k (100K/5K) |
| **Multimodal (Athena/vision, Argos)** | NVIDIA Muse Glimmer 30B (ViT-G/14, multimodal verificado) | OpenRouter modelo free com visão (a verificar no catálogo do dia) | DeepSeek V4.1 Flash (multimodal nativo, conforme briefing) | Visão exige lane multimodal real; não simular com modelo texto | R$ 0,00 |
| **Background / vault / telemetria (Callimachus, small_model)** | NVIDIA MiniMax M3.1 Flash (volume) | OpenRouter `inkling-small:free` | DeepSeek V4.1 Flash fora do pico | Trabalho mecânico; latência tolerável; evitar pico DeepSeek (Mon-Fri 01:00-04:00/06:00-10:00 UTC) | R$ 0,00 |
| **Segurança / auditoria (Artemis)** | NVIDIA Muse Glimmer 30B (reasoning + tool calling) | OpenRouter `north-mini-code:free` | DeepSeek V4.1 Flash | Segurança exige reasoning; não usar roteador aleatório | R$ 0,00 |
| **DevOps / infra (Prometheus)** | NVIDIA GPT-OSS-20B (DevOps pool) | OpenRouter `north-mini-code:free` | DeepSeek V4.1 Flash | Shell/infra com tool-calling; volume moderado | R$ 0,00 |

### Custo marginal do DeepSeek V4.1 Flash (US$ 0,05/1M in · US$ 0,60/1M out)

| Forma da request | Tokens (in/out) | Custo por request | Custo por 1.000 requests |
|---|---|---:|---:|
| Chat | 5.000 / 1.000 | US$ 0,00085 | **US$ 0,85** |
| Agêntica (coding) | 20.000 / 2.000 | US$ 0,00220 | **US$ 2,20** |
| Documento longo | 100.000 / 5.000 | US$ 0,00800 | **US$ 8,00** |
| Média ponderada (60/30/10) | — | **US$ 0,00197** | **US$ 1,97** |

> O prompt caching reduz a entrada em chamadas repetidas; o catálogo vivo pode variar por provedor. Os valores acima são o teto conservador do briefing.

---

## Etapa 2 — Árvore de roteamento e failover

### Regras SE/ENTÃO

```
SE a lane não teve probe verde nas últimas 24h
ENTÃO não rotear para ela (recusa explícita, nunca fallback silencioso).

SE a request é multimodal (imagem + texto)
ENTÃO primário NVIDIA Muse Glimmer 30B (visão verificada)
      → fallback OpenRouter modelo free com visão (verificar no catálogo do dia)
      → último recurso DeepSeek V4.1 Flash (se multimodal).

SE o volume projetado do dia é < 50 requests
ENTÃO primário OpenRouter :free (limite diário confortável)
      → fallback NVIDIA NIM (40 RPM)
      → pago apenas se crítico e o cap permitir.

SE o volume é > 100 requests/dia E o contexto ≤ 128K
ENTÃO primário Zen free (100 req/dia) para codificação
      → ao esgotar, NVIDIA NIM (40 RPM)
      → OpenRouter :free para o excedente de baixo risco
      → pago apenas se crítico.

SE o contexto necessário é > 128K
ENTÃO rotear para lane viva com ≥ 1M ctx (NVIDIA GLM-5.3 1M)
      → fallback OpenRouter long-ctx free
      → pago DeepSeek V4.1 Flash (1M ctx).
      (NÃO usar a lane NVIDIA deepseek-v4.1-flash: morta no probe 2026-10-23.)

SE a request é planejamento (Apollo) ou crítica de qualidade
ENTÃO NVIDIA GLM-5.3 (free) → OpenRouter north-mini (free)
      → GLM-5.3 pago (GO/Zen).
      NUNCA `openrouter/free` aleatório; SEMPRE id explícito.
      DeepSeek para Apollo somente no modo `cost-first` explícito.

SE a request é background/vault/telemetria
ENTÃO NVIDIA MiniMax M3.1 Flash (volume)
      → OpenRouter inkling-small:free
      → DeepSeek pago fora do pico (se o cap permitir).

SE o provedor primário atingiu 80% do limite diário
ENTÃO alertar e pré-rotear para o fallback (failover proativo).

SE o provedor atingiu 100% do limite diário
ENTÃO parar novas requests free nessa lane e usar o fallback;
      se todos os free acabaram e a tarefa é crítica → pago sob cap;
      se não é crítica → recusa honesta com o horário do reset.

SE o gasto pago mensal atingiu o cap (default US$ 5, configurável)
ENTÃO bloquear novas chamadas pagas e exigir override explícito do usuário.
      Toda chamada paga grava source='paid' em cost.jsonl.

SE a tarefa é crítica e todos os free falharam
ENTÃO escolher o provedor pago de menor preço no momento (catálogo vivo)
      — DeepSeek V4.1 Flash 1017 (US$ 0,05/0,60) como referência.
```

### Árvore (texto)

```
request
├─ probe verde? ──não──> recusa honesta (nada de lane morta)
├─ multimodal? ──sim──> NVIDIA Muse Glimmer → OpenRouter vision → DeepSeek pago
├─ contexto > 128K? ──sim──> NVIDIA GLM-5.3 (1M) → OpenRouter long-ctx → DeepSeek pago
├─ planejamento/crítico? ──sim──> NVIDIA GLM-5.3 → north-mini → GLM pago
├─ background? ──sim──> NVIDIA MiniMax M3.1 → inkling-small → DeepSeek off-peak
└─ volume do dia
   ├─ < 50 ──> OpenRouter :free
   └─ > 100 ──> Zen free (100/dia) → NVIDIA (40 RPM) → OpenRouter excedente
        └─ tudo esgotado? ──crítico?──> DeepSeek pago (cap) : recusa honesta
```

### Limiares de alerta

| Limiar | Ação | Dono |
|---|---|---|
| 80% do limite diário de qualquer provedor | Alerta + pré-failover | Hermes / Persephone |
| 100% do limite free | Failover imediato; log `free_exhausted` | Atlas |
| 80% do cap mensal pago | Alerta vermelho no painel | Persephone |
| 100% do cap pago | Bloqueio + override manual | Atlas / Artemis |
| Taxa de erro > 5% em 10 min | Circuit breaker na lane | Prometheus |
| p95 > 30s em lane free | Rebaixar prioridade da lane | Prometheus |

---

## Etapa 3 — Análise financeira

### 3.1 Custo mensal por cenário (30 dias)

| Cenário | 100% pago (DeepSeek) | Híbrido 90% free / 10% pago | Híbrido 95% free / 5% pago | GO (US$ 10 flat) | Zen Pro (US$ 9,99, a verificar) |
|---|---:|---:|---:|---:|---:|
| 100 req/dia (3.000/mês) | **US$ 5,91** | **US$ 0,59** | **US$ 0,30** | US$ 10,00 | US$ 9,99 |
| 500 req/dia (15.000/mês) | **US$ 29,55** | **US$ 2,96** | **US$ 1,48** | US$ 10,00 | US$ 9,99 |
| 1.000 req/dia (30.000/mês) | **US$ 59,10** | **US$ 5,91** | **US$ 2,96** | US$ 10,00 | US$ 9,99 |

> O híbrido é mais barato em **dinheiro**, mas os modelos free têm qualidade menor e limites instáveis. O GO compra qualidade e previsibilidade por US$ 10/mês; o híbrido compra economia com risco operacional. A decisão é de risco, não só de preço.

### 3.2 Payback dos US$ 10 na OpenRouter

O valor **não é uma taxa**: são US$ 10 de crédito utilizável em modelos pagos. O “payback” abaixo mede apenas o valor do desbloqueio (50 → 1.000 req/dia), comparando com o custo do fallback pago que ele evita.

| Volume | Requests acima do cap de 50/dia | Economia de fallback/mês | Tempo para recuperar US$ 10 |
|---|---:|---:|---:|
| 100 req/dia | 50/dia | US$ 2,96 | **~101 dias** |
| 500 req/dia | 450/dia | US$ 26,60 | **~11 dias** |
| 1.000 req/dia | 950/dia | US$ 56,15 | **~5 dias** |

- A 500-1.000 req/dia, o desbloqueio se paga rápido **se** o fallback seria pago.
- Se o fallback natural for outra lane free (NVIDIA), o desbloqueio vale menos — o crédito continua disponível.
- A 100 req/dia, comprar só pelo desbloqueio não se justifica; o crédito pode ficar para picos.

### 3.3 Zen Pro (US$ 9,99/mês) — quando compensa

| Volume | Custo 100% pago | Parcela paga necessária para o Pro empatar | Leitura |
|---|---:|---:|---|
| 100 req/dia | US$ 5,91 | **169%** | Impossível: o Pro nunca compensa contra o pago puro |
| 500 req/dia | US$ 29,55 | **33,8%** | Compensa se mais de ~1/3 do tráfego exigir pago |
| 1.000 req/dia | US$ 59,10 | **16,9%** | Compensa se mais de ~1/6 exigir pago |

> O Pro também precisa entregar o contexto de 200K e os limites prometidos; **confirmar antes**. Se o Pro tiver cap oculto ou não cobrir o contexto, a conta muda.
>
> Alternativa: o **GO a US$ 10/mês** já entrega GLM/Hy3 com caps previsíveis e é o default atual. O Zen Pro só faz sentido se o valor estiver nos modelos proprietários (Claude/GPT) e o volume pago for alto.

### 3.4 Comparação qualitativa

| Estratégia | Custo | Qualidade | Previsibilidade | Risco |
|---|---|---|---|---|
| 100% pago DeepSeek | Médio | Boa | Alta | Custo cresce linear |
| Híbrido free-first | Muito baixo | Variável | Baixa | Rate limits/churn |
| GO (US$ 10) | Baixo | Alta (GLM/Hy3) | Alta (caps) | Caps por modelo |
| Zen Pro (US$ 9,99) | Baixo | Alta (proprietários) | Média (a verificar) | Limites não confirmados |

---

## Etapa 4 — Riscos e mitigações

| Risco | Prob. | Impacto | Mitigação | Dono | Gatilho |
|---|---|---|---|---|---|
| Modelo `-free` descontinuado | Alta | Alto | Refresh diário + fallback fixo + falha barulhenta; nunca trocar em silêncio | Hermes | Probe 404/410 |
| Rate limit muda sem aviso | Média | Alto | Livro-caixa + 80% alerts + revalidação mensal dos docs | Persephone | 429/403 |
| Endpoint instável (timeout) | Alta | Médio | Circuit breaker + failover < 30s + retry com backoff | Prometheus | p95 > 30s |
| Roteador `openrouter/free` aleatório | Alta | Alto (qualidade) | Proibir em planejamento/crítico; ids explícitos; A/B | Apollo | Tarefa crítica |
| Fuga de gasto pago | Média | Alto | Cap mensal rígido + `source='paid'` + override manual | Artemis | 80% do cap |
| Regressão de qualidade free | Alta | Alto | Benchmark A/B + quality gate por lane | Dionysus | Queda > 10% no pass |
| Contexto insuficiente | Média | Alto | Rotear > 128K para lane 1M viva; nunca truncar em silêncio | Atlas | ctx > 128K |
| Privacidade/retenção | Média | Alto | Matriz de retenção; código sensível só em zero-retention | Artemis | Provider 30d |
| Dependência de um provedor | Média | Alto | Mínimo 2 provedores por workload; Symphony carrega contexto | Atlas | Provedor fora |
| Preço/câmbio muda | Média | Médio | `model-pricing.ts` catálogo vivo + revisão mensal | Persephone | Divergência > 10% |
| Vazamento de chave | Baixa | Crítico | Secrets scanner + rotação + auth.json 600 | Artemis | Alerta |
| Conflito com a lei do Apollo | Certa | Alto | Manter GLM no planejamento; `cost-first` só com aceite explícito | Apollo | Mudança de default |

### Métricas de monitoramento (por lane)

- Requests/dia e % do limite; 429/403/timeout rate; p50/p95 de latência.
- Custo real vs estimado (`cost.jsonl` com `source`), free share vs paid share.
- Custo por hop bem-sucedido; taxa de sucesso por workload; quality score do A/B.
- Alertas: 80% de qualquer limite; 100% do cap pago; circuit breaker aberto.

---

## Plano de implementação

| Fase | Entrega | Dono (god/demigod) | Prazo | Critério de aceite | Issue |
|---|---|---|---|---|---|
| **P0** | Re-probe dos fatos do briefing (Zen free, NVIDIA, OpenRouter, preço DeepSeek) | Hermes + researcher | **D+0–D+1** | Probe log com 1 token por lane; doc atualizado com o que está vivo | COST-1 |
| **P1** | Livro-caixa por provedor (contador diário, reset local, 80% alert, persistência) | Persephone + Hermes | **D+1–D+3** | Suíte no padrão `originkit-budget` verde | COST-2 |
| **P2** | Classificador de workload + roteador free-first com último recurso pago e cap | Atlas + Hephaestus | **D+2–D+5** | Dry-run de 100 requests: 0 pagos fora do cap; failover < 30s | COST-3 |
| **P3** | Preset `free-hybrid` + espelhos + `check-strategy-sync` + card de ativação | Apollo + Callimachus | **D+3–D+6** | Sync 9/9; apply idempotente; gate de autorização | COST-4 |
| **P4** | Telemetria free/paid + painel + linhas de alerta | Persephone + Dionysus | **D+4–D+7** | Painel mostra free share e gasto pago; testes verdes | COST-5 |
| **P5** | A/B de qualidade (10 tarefas) free vs pago + relatório de economia | Dionysus + Artemis | **D+6–D+8** | Relatório com pass rate, custo e recomendação | COST-6 |
| **P6** | UAT 24h + drill de rollback | Dionysus | **D+8–D+9** | Sem gasto descontrolado; rollback documentado | COST-6 |
| **P7** | Docs, CHANGELOG, release notes | Callimachus | **D+9–D+10** | Documento + MODEL-STRATEGIES atualizados | COST-1 |

### Rollout seguro

1. **Shadow mode:** o roteador registra a decisão que *teria* tomado, sem mudar o comportamento (1 semana ou 500 requests).
2. **Opt-in:** o preset `free-hybrid` aparece como escolha explícita; o default continua `go-balanced`.
3. **Promoção:** só após o A/B mostrar paridade aceitável nas tarefas críticas; caso contrário, fica como recomendação para custo.
4. **Rollback:** trocar a estratégia de volta para `go-balanced`/`free-openrouter` — sem migração de dados.

### Informações faltantes (bloqueiam a decisão final)

- Volume real de requests/dia (obter da telemetria após o livro-caixa).
- Mix real de workloads (classificador em shadow).
- Confirmação oficial dos limites do Zen free e do Zen Pro.
- Confirmação de que o DeepSeek V4.1 Flash pago está disponível na conta/região e o preço vigente.
- Requisitos de retenção/privacidade por tipo de projeto.
- Aceite (ou não) do modo `cost-first` para Apollo.

---

## Referências

- **Briefing do usuário (2026-10-23):** preços, limites e modelos citados neste documento (fonte primária das premissas).
- **OpenCode Zen:** https://opencode.ai/docs/zen/
- **OpenCode GO:** https://opencode.ai/docs/go
- **NVIDIA Build (NIM):** https://build.nvidia.com
- **OpenRouter — limites:** https://openrouter.ai/docs/api-reference/limits
- **OpenRouter — modelos:** https://openrouter.ai/models
- **DeepSeek V4.1 Flash (id de referência):** `deepseek/deepseek-v4.1-flash:1017` — verificar preço no catálogo OpenRouter.
- **Repositório OLYMPUS:**
  - `MODEL-STRATEGIES.md` — estratégias e caps atuais.
  - `src/lib/model-strategies.ts` — fonte canônica dos ids/lanes.
  - `src/lib/model-pricing.ts` — catálogo vivo e fallback de preços (#181).
  - `AGENTS.md` — lei do Apollo (GLM sagrado) e doutrina free-tier.
  - `docs/research/dependency-security-2026-10-23.md` — remediação das 19 vulnerabilidades.
- **Evidência de probe NVIDIA 2026-10-23 (#191):** GLM-5.3 200 @ 821-4887ms; MiniMax M3.1 200 @ 513-2630ms; Muse Glimmer 200 @ 655-974ms; GPT-OSS-20B 200 @ 988-1595ms; `deepseek-v4.1-flash` **timeout 20s** (não pinar).

---

*Documento vivo. Atualizar após P0 (re-probe) e após o A/B (P5).*
