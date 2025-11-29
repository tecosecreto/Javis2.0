// Tyzziz-Mobile.js — versão FINAL (pronta pra raw / bookmarklet)
(function() {
    'use strict';

    // URL do seu proxy (troque se necessário)
    const PROXY_URL = "https://api-banco.pintoassado390.workers.dev";

    // Selectors (ajuste se a página usar outros)
    const ACTIVE_QUESTION_SELECTOR = ".question-text-color";
    const PA_NEXT_BTN = '.next-question-button, .slide-next-button, .right-navigator';
    const PA_SUBMIT_BTN = 'button[data-cy="submit-button"]';

    // Estado interno
    let gameData = null;
    let panel = null;
    let autoMode = false;
    let currentQuestion = "";
    let observer = null;

    /* ----------------------- Interceptador fetch (mobile-friendly) ----------------------- */
    (function hijackFetch() {
        try {
            const originalFetch = window.fetch.bind(window);
            window.fetch = async function(...args) {
                const response = await originalFetch(...args);
                try {
                    const clone = response.clone();
                    const data = await clone.json().catch(() => null);

                    // Detecta estrutura de jogo / perguntas
                    if (data?.room?.questions && !gameData) {
                        gameData = data.room.questions;
                        renderQuestions(gameData);
                    }

                    // Desliga autoMode se fim de jogo for detectado
                    const resource = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
                    if (resource.includes("/playerGameOver") || resource.includes("/player-summary")) {
                        autoMode = false;
                        safeLog("Fim de jogo detectado — Piloto automático desligado.");
                    }
                } catch (e) {
                    // silencioso
                }
                return response;
            };
        } catch (e) {
            console.warn("Falha ao tentar interceptar fetch:", e);
        }
    })();

    /* ----------------------- UI (painel mobile) ----------------------- */
    function createPanel() {
        // evita duplicar painel
        if (document.getElementById('tyzziz-mobile-panel')) return;

        panel = document.createElement("div");
        panel.id = "tyzziz-mobile-panel";
        Object.assign(panel.style, {
            position: "fixed",
            bottom: "10px",
            right: "10px",
            width: "300px",
            maxHeight: "65vh",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #ddd",
            boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
            zIndex: 2147483647,
            overflowY: "auto",
            padding: "8px",
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: "13px",
            color: "#111"
        });

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="font-weight:700;">🧠 Tyzziz Mobile</div>
                    <div style="font-size:11px;color:#666;">(mobile)</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button id="tyz-toggle-auto" title="Piloto Automático" style="padding:6px;border-radius:8px;border:1px solid #ccc;background:#fff;">🚀</button>
                    <button id="tyz-refresh" title="Resetar" style="padding:6px;border-radius:8px;border:1px solid #ccc;background:#fff;">🔄</button>
                    <button id="tyz-close" title="Fechar" style="padding:6px;border-radius:8px;border:1px solid #ccc;background:#fff;">✖</button>
                </div>
            </div>
            <div id="tyz-content" style="margin-top:10px;">
                <div style="color:#666;">Aguardando jogo... espere até as perguntas serem detectadas.</div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:#666;">
                <div>Toque em <b>Resolver 🤖</b> para consultar o proxy/IA.</div>
            </div>
        `;

        document.body.appendChild(panel);

        // eventos
        const btnAuto = document.getElementById("tyz-toggle-auto");
        const btnRefresh = document.getElementById("tyz-refresh");
        const btnClose = document.getElementById("tyz-close");

        btnAuto.addEventListener('click', () => {
            autoMode = !autoMode;
            btnAuto.style.background = autoMode ? "#dff7df" : "#fff";
            safeLog("Piloto Automático: " + (autoMode ? "ON" : "OFF"));
            if (autoMode) autoSolve(); // dispara tentativa imediata
        });

        btnRefresh.addEventListener('click', () => {
            gameData = null;
            currentQuestion = "";
            const content = document.getElementById("tyz-content");
            if (content) content.innerHTML = '<div style="color:#666">Aguardando jogo...</div>';
            safeLog("Dados resetados manualmente.");
        });

        btnClose.addEventListener('click', () => {
            panel.remove();
            if (observer) observer.disconnect();
            safeLog("Painel removido.");
        });
    }

    /* ----------------------- Render perguntas obtidas ----------------------- */
    function renderQuestions(questions) {
        const div = document.getElementById("tyz-content");
        if (!div) return;

        let html = '';
        for (const qid in questions) {
            try {
                const q = questions[qid];
                const text = clean(q.structure.query.text || "");
                const opts = (q.structure.options || []).map(o => clean(o.text || ""));
                html += `
                    <div class="tyz-q" style="margin-bottom:10px;padding:8px;border-radius:8px;border:1px solid #f0f0f0;background:#fff;">
                        <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(text)}</div>
                        <div style="margin-bottom:6px;">${opts.map((o,i)=>`<div style="font-size:13px">${String.fromCharCode(65+i)}) ${escapeHtml(o)}</div>`).join('')}</div>
                        <button class="tyz-solve" data-q="${encodeURIComponent(text)}" data-o="${encodeURIComponent(JSON.stringify(opts))}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #bbb;background:#f7f7f7;">Resolver 🤖</button>
                    </div>
                `;
            } catch (e) { continue; }
        }

        div.innerHTML = html || '<div style="color:#666">Nenhuma pergunta formatada encontrada.</div>';

        // bind buttons
        div.querySelectorAll('.tyz-solve').forEach(btn => btn.addEventListener('click', () => solve(btn)));
    }

    /* ----------------------- Chamada ao proxy / IA ----------------------- */
    async function solve(button) {
        try {
            const q = decodeURIComponent(button.getAttribute('data-q') || "");
            const opts = JSON.parse(decodeURIComponent(button.getAttribute('data-o') || "[]"));

            const prompt = [
                "Analise a pergunta abaixo e responda APENAS com a letra da alternativa correta (ex: A) e o texto da alternativa.",
                "",
                "Pergunta:",
                q,
                "",
                "Opções:",
                ...opts.map((o,i)=>`${String.fromCharCode(65+i)}) ${o}`)
            ].join('\n');

            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = "Consultando IA...";

            const resp = await fetchProxy(prompt);
            if (!resp) {
                button.textContent = "Erro!";
                setTimeout(()=>button.textContent = originalText, 1200);
                button.disabled = false;
                return;
            }

            // tenta extrair resposta legível
            const answer = extractAnswer(resp);
            button.textContent = answer || (resp.substring(0,120) || "Resposta");
        } catch (e) {
            console.error("solve error:", e);
            button.textContent = "Erro!";
        } finally {
            button.disabled = false;
        }
    }

    // Faz POST para o PROXY_URL
    async function fetchProxy(prompt) {
        try {
            const res = await fetch(PROXY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }]
                })
            });
            if (!res.ok) {
                safeLog("Proxy respondeu com erro: " + res.status);
                return null;
            }
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                return (data.choices?.[0]?.message?.content) || text;
            } catch (e) {
                return text;
            }
        } catch (err) {
            console.error("fetchProxy error:", err);
            return null;
        }
    }

    /* ----------------------- Observador de pergunta ativa (para autoMode) ----------------------- */
    function observeActive() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            const el = document.querySelector(ACTIVE_QUESTION_SELECTOR);
            if (!el) return;
            const text = clean(el.parentElement ? el.parentElement.textContent : el.textContent || "");
            if (!text) return;
            if (text !== currentQuestion) {
                currentQuestion = text;
                safeLog("Pergunta ativa: " + currentQuestion);
                if (autoMode) autoSolve();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    /* ----------------------- Auto-resolve simplificado ----------------------- */
    async function autoSolve() {
        // procura botão .tyz-solve que corresponda à pergunta atual
        const items = Array.from(document.querySelectorAll('.tyz-solve'));
        const match = items.find(b => {
            try {
                const q = decodeURIComponent(b.getAttribute('data-q') || "");
                return currentQuestion && q && q.startsWith(currentQuestion.slice(0, Math.min(80, currentQuestion.length)));
            } catch (e) { return false; }
        });

        if (!match) {
            safeLog("AutoSolve: correspondência não encontrada.");
            return;
        }

        match.click();
        await sleep(900);

        // tenta enviar/responder automaticamente:
        const submit = document.querySelector(PA_SUBMIT_BTN) || document.querySelector(PA_NEXT_BTN);
        if (submit && !submit.disabled) {
            try { submit.click(); safeLog("AutoSolve: clique em enviar/próximo."); } catch (e) {}
        }
    }

    /* ----------------------- Utilitárias ----------------------- */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function clean(t) { return String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g," ").trim(); }
    function escapeHtml(t) { return String(t || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    function safeLog(...args) { try { console.log("[Tyzziz]", ...args); } catch (e) {} }

    // tenta extrair "A) texto" ou "A" do retorno da IA
    function extractAnswer(text) {
        if (!text) return null;
        // normaliza
        const t = text.replace(/\r/g,'\n').trim();
        // procura padrão "A) ...", "A - ...", "A)texto"
        const m1 = t.match(/([A-E])\s*[\)\-:]\s*(.+)/i);
        if (m1) return (m1[1].toUpperCase() + ") " + m1[2].trim());
        const m2 = t.match(/^([A-E])\b/i);
        if (m2) return m2[1].toUpperCase();
        // fallback: primeira linha curta
        const firstLine = t.split('\n').find(l => l.trim());
        return firstLine ? firstLine.trim() : t.substring(0, 120);
    }

    /* ----------------------- Inicialização ----------------------- */
    try {
        createPanel();
        observeActive();

        // se perguntas já estiverem no DOM por fetch prévio, tenta processar
        // (procura objetos JSON inline nos responses — se houver outra fonte, gameData será preenchido pelo interceptor)
        safeLog("Tyzziz Mobile iniciado.");
    } catch (e) {
        console.error("Erro ao iniciar Tyzziz Mobile:", e);
    }

})();
