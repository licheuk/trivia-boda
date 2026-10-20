(() => {
  const $ = id => document.getElementById(id);
  const sections = ["statusCard","welcome","quiz","review","done","closed"];
  const state = { code:"", token:"", questions:[], answers:{}, current:0, contest:null, busy:false };
  const letters = ["A","B","C","D"];
  const apiUrl = window.TRIVIA_CONFIG?.API_URL || "";

  function show(id) { sections.forEach(s => $(s).classList.toggle("hidden", s !== id)); }
  function setError(id, message="") { $(id).textContent = message; }
  function jsonp(params) {
    return new Promise((resolve,reject) => {
      if (!apiUrl || apiUrl.includes("PEGA_AQUI")) return reject(new Error("Falta configurar la URL del servicio."));
      const cb = "trivia_cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timer = setTimeout(() => { cleanup(); reject(new Error("No pudimos conectar. Intenta de nuevo.")); }, 12000);
      function cleanup(){ clearTimeout(timer); delete window[cb]; script.remove(); }
      window[cb] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error("No pudimos conectar con el concurso.")); };
      script.src = apiUrl + "?" + new URLSearchParams({...params, callback:cb, _:Date.now()}).toString();
      document.body.appendChild(script);
    });
  }
  async function loadStatus() {
    try {
      const data = await jsonp({action:"status"});
      if (!data.ok) throw new Error(data.message || "No pudimos consultar el concurso.");
      state.contest = data;
      if (!data.open) { show("closed"); return; }
      $("statusCard").classList.add("hidden");
      show("welcome");
    } catch (e) {
      $("statusCard").innerHTML = `<p class="error">${escapeHtml(e.message)}</p><button class="secondary" id="retryBtn">Reintentar</button>`;
      $("retryBtn").onclick = loadStatus;
    }
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("startBtn").onclick = async () => {
    setError("welcomeError");
    const code = $("code").value.trim().toUpperCase();
    if (!code) { setError("welcomeError","Escribe el código personal que recibiste."); return; }
    $("startBtn").disabled = true; $("startBtn").textContent = "Validando…";
    try {
      const data = await jsonp({action:"start",code});
      if (!data.ok) throw new Error(data.message || "No fue posible comenzar.");
      state.code = code; state.token = data.token; state.questions = data.questions; state.answers = {};
      state.current = 0; renderQuestion(); show("quiz");
    } catch(e) { setError("welcomeError",e.message); }
    finally { $("startBtn").disabled=false; $("startBtn").innerHTML='Comenzar trivia <span>→</span>'; }
  };
  function renderQuestion() {
    const q = state.questions[state.current];
    $("progressLabel").textContent = `Pregunta ${state.current+1} de ${state.questions.length}`;
    $("answeredLabel").textContent = `${Object.keys(state.answers).length} respondidas`;
    $("progressBar").style.width = `${((state.current+1)/state.questions.length)*100}%`;
    $("questionNumber").textContent = `PREGUNTA ${String(state.current+1).padStart(2,"0")}`;
    $("questionText").textContent = q.text;
    $("options").innerHTML = "";
    q.options.forEach((option,i) => {
      const btn = document.createElement("button");
      btn.className = "option" + (state.answers[q.id] === i ? " selected" : "");
      btn.innerHTML = `<span class="letter">${letters[i]}</span><span>${escapeHtml(option)}</span>`;
      btn.onclick = () => { state.answers[q.id] = i; renderQuestion(); };
      $("options").appendChild(btn);
    });
    $("backBtn").disabled = state.current === 0;
    $("nextBtn").textContent = state.current === state.questions.length-1 ? "Revisar respuestas →" : "Siguiente →";
    setError("quizError");
  }
  $("backBtn").onclick = () => { if(state.current>0){state.current--;renderQuestion();} };
  $("nextBtn").onclick = () => {
    const q=state.questions[state.current];
    if (state.answers[q.id] === undefined) { setError("quizError","Selecciona una respuesta para continuar."); return; }
    if (state.current < state.questions.length-1) { state.current++; renderQuestion(); }
    else {
      const unanswered = state.questions.filter(x=>state.answers[x.id]===undefined).length;
      $("reviewText").textContent = unanswered ? `Te faltan ${unanswered} pregunta(s). Puedes volver y completarlas antes de enviar.` : `Has respondido las ${state.questions.length} preguntas. Cuando envíes, tus respuestas quedarán registradas.`;
      $("submitBtn").disabled = unanswered > 0;
      show("review");
    }
  };
  $("editBtn").onclick = () => { state.current=0;renderQuestion();show("quiz"); };
  $("submitBtn").onclick = async () => {
    if (state.busy) return;
    state.busy=true; $("submitBtn").disabled=true; $("submitBtn").textContent="Enviando…";
    setError("submitError","Enviando tu participación…");
    try {
      const data = await jsonp({
        action:"submit",
        code:state.code,
        token:state.token,
        answers:JSON.stringify(state.answers)
      });
      if (data.ok || /ya registramos una participación|ya registramos|participación ya registrada/i.test(data.message || "")) {
        show("done");
      } else {
        setError("submitError",data.message || "No pudimos registrar las respuestas. Comprueba tu conexión antes de volver a intentarlo.");
        $("submitBtn").disabled=false;
        $("submitBtn").textContent="Reintentar envío";
      }
    } catch (e) {
      setError("submitError","No recibimos confirmación del servidor. No vuelvas a enviar todavía: estamos comprobando si tu participación quedó registrada. Espera unos segundos o solicita ayuda a la persona organizadora.");
      $("submitBtn").disabled=true;
      $("submitBtn").textContent="Verificando envío…";
      try {
        const check = await jsonp({action:"check",code:state.code,token:state.token});
        if (check.ok && check.submitted) {
          show("done");
        } else {
          setError("submitError","No pudimos confirmar el registro. No intentes enviar repetidamente; consulta a la persona organizadora antes de reintentar.");
          $("submitBtn").disabled=false;
          $("submitBtn").textContent="Reintentar envío";
        }
      } catch (_) {
        setError("submitError","No pudimos confirmar el registro por un problema de conexión. No vuelvas a enviar repetidamente; consulta a la persona organizadora.");
      }
    } finally {
      state.busy=false;
    }
  };
  loadStatus();
})();