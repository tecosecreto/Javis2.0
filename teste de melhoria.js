((function() {
    'use strict';

    const PROXY_URL = "https://api-banco.pintoassado390.workers.dev";

    const ACTIVE_QUESTION_SELECTOR = ".question-text-color";
    const PA_NEXT_BTN = '.next-question-button, .slide-next-button, .right-navigator';
    const PA_SUBMIT_BTN = 'button[data-cy="submit-button"]';

    let gameData = null;
    let panel = null;
    let autoMode = false;
    let currentQuestion = "";
    let observer = null;

    /* ------------------------------------------------------ */
    /*              FETCH INTERCEPTOR MOBILE                  */
    /* ------------------------------------------------------ */
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
            const clone = response.clone();
            const data = await clone.json().catch(() => null);

            if (data?.room?.questions && !gameData) {
                gameData = data.room.questions;
                renderQuestions(gameData);
            }

            if ((args[0] + "").includes("/playerGameOver")) {
                autoMode = false;
            }
        } catch (_) {}
        return response;
    };

    /* ------------------------------------------------------ */
    /*                      GUI MOBILE                        */
    /* ------------------------------------------------------ */
    function createPanel() {
        panel = document.createElement("div");
        panel.id = "tyzziz-mobile-panel";
        panel.style = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 260px;
            max-height: 60vh;
            background: #fff;
            border-radius: 12px;
            border: 1px solid #ccc;
            box-shadow: 0 0 12px rgba(0,0,0,.25);
            z-index: 999999;
            overflow-y: auto;
            padding: 10px;
            font-family: Arial;
        `;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <b>Tyzziz Mobile</b>
                <button id="tyz-auto" style="padding:4px 8px;">🚀</button>
            </div>
            <div id="tyz-content" style="margin-top:10px;font-size:14px;">
                Aguardando jogo...
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById("tyz-auto").onclick = () => {
            autoMode = !autoMode;
            document.getElementById("tyz-auto").style.background = autoMode ? "#b2ffb2" : "";
        };
    }

    /* ------------------------------------------------------ */
    /*                 ATUALIZAR LISTA DE PERGUNTAS           */
    /* ------------------------------------------------------ */
    function renderQuestions(questions) {
        const div = document.getElementById("tyz-content");
        if (!div) return;

        let html = "";
        for (const qid in questions) {
            const q = questions[qid];
            const text = clean(q.structure.query.text);
            const opts = q.structure.options?.map(o => clean(o.text)) || [];

            html += `
                <div style="margin-bottom:10px;border:1px solid #eee;padding:6px;border-radius:6px;">
                    <div><b>${text}</b></div>
                    ${opts.map((o,i)=>`<div>${String.fromCharCode(65+i)}) ${o}</div>`).join("")}
                    <button class="solve" data-q="${encodeURIComponent(text)}"
                        data-o="${encodeURIComponent(JSON.stringify(opts))}"
                        style="margin-top:6px;width:100%;padding:4px;">Resolver 🤖</button>
                </div>
            `;
        }

        div.innerHTML = html;

        document.querySelectorAll(".solve").forEach(btn => {
            btn.onclick = () => solve(btn);
        });
    }

    /* ------------------------------------------------------ */
    /*                  CHAMAR IA VIA PROXY                   */
    /* ------------------------------------------------------ */
    async function solve(button) {
        const q = decodeURIComponent(button.dataset.q);
        const opts = JSON.parse(decodeURIComponent(button.dataset.o));

        const prompt = `
Pergunta:
${q}

Opções:
${opts.map((o,i)=>`${String.fromCharCode(65+i)}) ${o}`).join("\n")}

Responda apenas com a alternativa correta.
        `.trim();

        button.textContent = "Consultando IA...";
        button.disabled = true;

        try {
            const req = await fetch(PROXY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role:"user", content: prompt }]
                })
            });

            const txt = await req.text();
            const data = JSON.parse(txt);
            const resp = data.choices[0].message.content;

            button.textContent = resp;

        } catch (err) {
            button.textContent = "Erro!";
        }
        button.disabled = false;
    }

    /* ------------------------------------------------------ */
    /*              OBSERVAR PERGUNTA ATIVA                   */
    /* ------------------------------------------------------ */
    function observeActive() {
        observer = new MutationObserver(() => {
            const el = document.querySelector(ACTIVE_QUESTION_SELECTOR);
            if (!el) return;
            const text = clean(el.parentElement.textContent);

            if (text !== currentQuestion) {
                currentQuestion = text;
                if (autoMode) autoSolve();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ------------------------------------------------------ */
    /*             AUTO-RESOLVER MOBILE (SIMPLIFICADO)        */
    /* ------------------------------------------------------ */
    async function autoSolve() {
        const item = [...document.querySelectorAll(".solve")]
            .find(b => decodeURIComponent(b.dataset.q).startsWith(currentQuestion));

        if (!item) return;
        item.click();

        await sleep(1000);

        const next = document.querySelector(PA_SUBMIT_BTN) || document.querySelector(PA_NEXT_BTN);
        if (next) next.click();
    }

    /* ------------------------------------------------------ */
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const clean = t => (t||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();

    /* ------------------------------------------------------ */
    createPanel();
    observeActive();

})();

