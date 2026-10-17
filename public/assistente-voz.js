// ============================================================
// ASSISTENTE DE VOZ (painel do odontograma)
// ------------------------------------------------------------
// 1) Grava o áudio no próprio navegador (iPhone, Android e computador) com um toque.
// 2) Manda pro servidor, que transcreve e devolve só o texto.
// 3) Um leitor de frases (voz-parser.js) separa dente, estado, tratamento e valor.
// 4) Mostra um cartão de confirmação EDITÁVEL — nada é gravado na ficha antes de "Aplicar".
// Também dá pra digitar a frase na caixa de texto (funciona sem microfone e sem internet de voz).
// ============================================================
(function(){
  const NOMES_ESTADO = { '': '— manter o estado atual —', '0': 'Sem alteração', '1': 'Problema', '2': 'Tratado', '3': 'Ausente' };

  function h(tag, props, filhos){
    const e = document.createElement(tag);
    Object.keys(props || {}).forEach(k => {
      if(k === 'style') e.style.cssText = props[k];
      else if(k === 'class') e.className = props[k];
      else if(k.startsWith('on')) e[k] = props[k];
      else e.setAttribute(k, props[k]);
    });
    (filhos || []).forEach(f => e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f));
    return e;
  }
  function dinheiro(n){ return (n === null || n === undefined || n === '') ? '' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function lerDinheiro(txt){
    let t = String(txt || '').replace(/[^\d,.]/g, '');
    if(!t) return null;
    if(/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/[.,]/g, '');
    const n = parseFloat(t); return isNaN(n) ? null : n;
  }
  function suportaGravacao(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
  function escolherMime(){
    const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for(const t of tipos){ if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
    return '';
  }
  function paraBase64(blob){
    return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = erro; r.readAsDataURL(blob); });
  }

  window.criarPainelAssistenteVoz = function(opcoes){
    opcoes = opcoes || {};
    const obterProc = opcoes.obterProcedimentos || (() => []);
    let estadoServidor = { configurada: false, minutosUsados: 0, limiteMinutos: 0 };
    let gravando = false, rec = null, stream = null, audioCtx = null, timers = [], pedaços = [], inicio = 0, mimeUsado = '', semFala = false, bloqueado = false;

    const raiz = h('div', { id: 'assistente-voz', style: 'background:#fff;border:1.5px solid var(--line-light, #d6dcea);border-radius:12px;padding:12px;margin-top:10px;' });
    raiz.appendChild(h('style', {}, [
      '#assistente-voz .av-b{border:none;border-radius:10px;padding:10px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;}',
      '#assistente-voz .av-p{background:var(--vibe-gradient-accent,#f26a1b);color:#fff;}',
      '#assistente-voz .av-s{background:#e9edf3;color:#44506a;}',
      '#assistente-voz .av-ok{background:#16a34a;color:#fff;}',
      '#assistente-voz .av-stop{background:#fde8e8;color:#b91c1c;box-shadow:inset 0 0 0 2px #e53935;}',
      '#assistente-voz .av-add{background:#eaf2ff;color:#0b3b86;box-shadow:inset 0 0 0 1.5px #9bbcf0;text-align:center;}',
      '#assistente-voz button:disabled{opacity:.5;cursor:default;}'
    ]));
    raiz.appendChild(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;' }, [
      h('div', { style: 'font-weight:700;color:var(--blue-dark,#0b3b86);' }, ['🎙 Assistente de voz']),
      h('div', { id: 'av-uso', style: 'font-size:11px;color:var(--muted,#666);' }, [''])
    ]));
    raiz.appendChild(h('p', { style: 'font-size:12px;color:var(--muted,#666);margin:6px 0 8px;' },
      ['Toque em Falar e diga, por exemplo: “dente 46, problema, tratamento de canal, mil e oitocentos reais”. Você confere antes de gravar na ficha.']));
    const botao = h('button', { type: 'button', id: 'av-falar', class: 'av-b av-p', style: 'width:100%;font-size:15px;padding:12px;' }, ['🎙 Falar']);
    const estado = h('div', { id: 'av-status', style: 'font-size:12px;margin:8px 0;min-height:16px;color:var(--muted,#666);' }, ['']);
    const caixa = h('textarea', { id: 'av-texto', rows: '2', placeholder: 'Ou digite aqui: dente 46, problema, canal, 1800 reais', style: 'width:100%;border:1.5px solid var(--line,#ccd);border-radius:8px;padding:8px;font-family:inherit;font-size:13px;resize:vertical;' });
    const linhaBotoes = h('div', { style: 'display:flex;gap:8px;margin-top:6px;' }, [
      h('button', { type: 'button', id: 'av-interpretar', class: 'av-b av-p', style: 'flex:1;' }, ['Interpretar texto']),
      h('button', { type: 'button', id: 'av-limpar', class: 'av-b av-s', style: 'flex:0 0 auto;' }, ['Limpar'])
    ]);
    const areaCartao = h('div', { id: 'av-cartao', style: 'margin-top:10px;' });
    [botao, estado, caixa, linhaBotoes, areaCartao].forEach(x => raiz.appendChild(x));

    function msg(txt, cor){ estado.textContent = txt || ''; estado.style.color = cor || 'var(--muted,#666)'; }

    function atualizarUso(){
      const u = raiz.querySelector('#av-uso');
      if(!estadoServidor.configurada){ u.textContent = ''; return; }
      u.textContent = 'Voz neste mês: ' + Math.round(estadoServidor.minutosUsados) + ' de ' + Math.round(estadoServidor.limiteMinutos) + ' min';
    }
    async function carregarEstado(){
      if(!suportaGravacao()){ botao.disabled = true; botao.style.opacity = '.5'; msg('Este aparelho ou navegador não permite gravar voz aqui. Digite a frase na caixa abaixo.'); return; }
      if(!window.isSecureContext){ botao.disabled = true; botao.style.opacity = '.5'; msg('O microfone só funciona em conexão segura (https). Digite a frase na caixa abaixo.'); return; }
      try{
        const r = await fetch('/api/voz/estado'); estadoServidor = await r.json();
        if(!estadoServidor.configurada){ botao.disabled = true; botao.style.opacity = '.5'; msg('A gravação de voz ainda não foi ativada neste sistema. Você pode digitar a frase abaixo.'); }
        else if(estadoServidor.minutosUsados >= estadoServidor.limiteMinutos){ botao.disabled = true; botao.style.opacity = '.5'; msg('O limite de minutos de voz deste mês acabou. Você pode digitar a frase abaixo.', '#b45309'); }
        atualizarUso();
      }catch(e){ /* sem internet: segue só com a caixa de texto */ }
    }

    // ---------- gravação ----------
    function limparGravacao(){
      timers.forEach(t => clearInterval(t)); timers = [];
      try{ if(rec && rec.state !== 'inactive') rec.stop(); }catch(e){}
      if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
      if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx = null; }
    }
    function pararGravacao(){ if(!gravando) return; gravando = false; botao.textContent = '🎙 Falar'; botao.className = 'av-b av-p'; limparGravacaoParcial(); }
    function limparGravacaoParcial(){ timers.forEach(t => clearInterval(t)); timers = []; try{ if(rec && rec.state !== 'inactive') rec.stop(); }catch(e){} }

    async function iniciarGravacao(){
      if(bloqueado) return;
      // O AudioContext precisa nascer dentro do toque (regra do iPhone).
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC){ try{ audioCtx = new AC(); if(audioCtx.resume) audioCtx.resume(); }catch(e){ audioCtx = null; } }
      try{
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      }catch(e){
        limparGravacao();
        msg(e && e.name === 'NotAllowedError' ? 'O navegador bloqueou o microfone. Permita o microfone nas configurações do site e tente de novo.' : 'Não consegui abrir o microfone neste aparelho.', '#b91c1c');
        return;
      }
      mimeUsado = escolherMime(); pedaços = []; semFala = false;
      rec = new MediaRecorder(stream, mimeUsado ? { mimeType: mimeUsado } : {});
      rec.ondataavailable = (ev) => { if(ev.data && ev.data.size) pedaços.push(ev.data); };
      rec.onstop = () => { const tipo = rec.mimeType || mimeUsado || 'audio/webm'; limparGravacao(); enviar(tipo); };
      rec.start(); inicio = Date.now(); gravando = true;
      botao.textContent = '⏹ Parar'; botao.className = 'av-b av-stop';
      msg('● Gravando… fale e faça uma pausa quando terminar (ou toque em Parar).', '#b91c1c');
      timers.push(setInterval(() => {
        const seg = Math.round((Date.now() - inicio) / 1000);
        if(seg >= 60){ pararGravacao(); }
      }, 500));
      if(audioCtx && stream){                     // parada automática depois de uma pausa na fala
        try{
          const fonte = audioCtx.createMediaStreamSource(stream); const an = audioCtx.createAnalyser(); an.fftSize = 1024; fonte.connect(an);
          const buf = new Uint8Array(an.fftSize); let falou = false, ultimoSom = Date.now();
          timers.push(setInterval(() => {
            an.getByteTimeDomainData(buf); let dev = 0; for(let i = 0; i < buf.length; i++) dev = Math.max(dev, Math.abs(buf[i] - 128));
            if(dev / 128 > 0.06){ falou = true; ultimoSom = Date.now(); }
            else if(falou && Date.now() - ultimoSom > 1800){ pararGravacao(); }
            else if(!falou && Date.now() - inicio > 9000){ semFala = true; pararGravacao(); }
          }, 100));
        }catch(e){ /* sem parada automática: o botão Parar continua valendo */ }
      }
    }

    async function enviar(tipo){
      botao.textContent = '🎙 Falar'; botao.className = 'av-b av-p'; botao.style.cssText = 'width:100%;font-size:15px;padding:12px;';
      const duracao = (Date.now() - inicio) / 1000;
      if(semFala){ msg('Não ouvi nada. Toque em Falar e tente de novo, mais perto do microfone.', '#b45309'); return; }
      if(!pedaços.length){ msg('A gravação ficou vazia. Tente de novo.', '#b45309'); return; }
      const blob = new Blob(pedaços, { type: tipo });
      msg('Transcrevendo…'); botao.disabled = true;
      try{
        const audio = await paraBase64(blob);
        const resp = await fetch('/api/voz/transcrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio, mime: tipo, duracao }) });
        const j = await resp.json().catch(() => ({}));
        if(!resp.ok){
          msg(j.erro || 'Não foi possível transcrever agora. Tente de novo ou digite.', '#b91c1c');
          if(j.codigo === 'limite_mensal' || j.codigo === 'voz_nao_configurada'){ bloqueado = true; botao.style.opacity = '.5'; return; }
          botao.disabled = false; return;
        }
        if(j.uso){ estadoServidor.minutosUsados = j.uso.minutos; estadoServidor.limiteMinutos = j.uso.limiteMinutos; atualizarUso(); }
        caixa.value = j.texto || '';
        msg(j.texto ? 'Pronto. Confira o que entendi abaixo.' : 'Não consegui entender a fala. Tente de novo ou digite.', j.texto ? '#15803d' : '#b45309');
        botao.disabled = false;
        if(j.texto) interpretar();
      }catch(e){
        msg('Sem conexão com o servidor. Verifique a internet ou digite a frase.', '#b91c1c'); botao.disabled = false;
      }
    }

    botao.onclick = () => { if(gravando) pararGravacao(); else iniciarGravacao(); };

    // ---------- interpretação e cartão de confirmação ----------
    function interpretar(){
      areaCartao.innerHTML = '';
      const texto = caixa.value.trim();
      if(!texto){ msg('Escreva ou grave uma frase primeiro.', '#b45309'); return; }
      const res = window.VozParser.interpretar(texto, { procedimentos: obterProc() });
      mostrarCartao(res, texto);
    }
    raiz.querySelector('#av-interpretar').onclick = interpretar;
    raiz.querySelector('#av-limpar').onclick = () => { caixa.value = ''; areaCartao.innerHTML = ''; msg(''); };

    function campo(rotulo, valor, largura, tipo){
      const inp = h('input', { type: tipo || 'text', value: valor === null || valor === undefined ? '' : String(valor), style: 'width:100%;border:1.5px solid var(--line,#ccd);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;' });
      const caixaCampo = h('div', { style: 'flex:' + (largura || 1) + ';min-width:90px;' }, [h('div', { style: 'font-size:10.5px;color:var(--muted,#666);margin-bottom:2px;' }, [rotulo]), inp]);
      return { caixa: caixaCampo, inp };
    }

    function mostrarCartao(res, textoOriginal){
      areaCartao.innerHTML = '';
      const cartao = h('div', { style: 'border:2px solid var(--blue-dark,#0b5fd9);border-radius:12px;padding:10px;background:#f7faff;' });
      cartao.appendChild(h('div', { style: 'font-weight:700;margin-bottom:4px;' }, ['Entendi o seguinte — confira e corrija se precisar:']));
      (res.avisos || []).forEach(a => cartao.appendChild(h('div', { style: 'background:#fff4e0;border-left:4px solid #f0a020;padding:6px 8px;border-radius:5px;font-size:12px;margin:6px 0;' }, [a])));
      const blocos = [];
      (res.itens || []).forEach((it, idx) => {
        const bloco = h('div', { style: 'background:#fff;border:1.5px solid #cfe0f7;border-radius:10px;padding:8px;margin:8px 0;' });
        const marcar = h('input', { type: 'checkbox', checked: 'checked' });
        const topo = h('label', { style: 'display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:6px;' }, [marcar, 'Dente ' + it.dente]);
        const fDente = campo('Número do dente', it.dente, 0.6, 'number');
        const sel = h('select', { style: 'width:100%;border:1.5px solid var(--line,#ccd);border-radius:6px;padding:6px 8px;font-size:13px;' });
        Object.keys(NOMES_ESTADO).forEach(k => { const o = h('option', { value: k }, [NOMES_ESTADO[k]]); if(String(it.estado === null ? '' : it.estado) === k) o.selected = true; sel.appendChild(o); });
        const fSit = campo('Situação / diagnóstico', it.situacao, 1.2);
        bloco.appendChild(topo);
        bloco.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;' }, [fDente.caixa, h('div', { style: 'flex:1;min-width:130px;' }, [h('div', { style: 'font-size:10.5px;color:var(--muted,#666);margin-bottom:2px;' }, ['Estado do dente']), sel]), fSit.caixa]));
        const linhasProc = [];
        const areaProc = h('div', {});
        (it.tratamentos.length ? it.tratamentos : []).forEach(t => adicionarLinhaProc(areaProc, linhasProc, t.tratamento, t.valor));
        const mais = h('div', { class: 'av-b av-add', style: 'font-size:12px;padding:6px;margin-top:4px;' }, ['+ Outro procedimento neste dente']);
        mais.onclick = () => adicionarLinhaProc(areaProc, linhasProc, '', null);
        bloco.appendChild(areaProc); bloco.appendChild(mais);
        cartao.appendChild(bloco);
        blocos.push({ marcar, fDente, sel, fSit, linhasProc });
      });
      const linhasOutros = [];
      const areaOutros = h('div', {});
      if((res.outros || []).length){
        const tit = h('div', { style: 'font-weight:700;margin:8px 0 4px;' }, ['Outros tratamentos (sem dente específico)']);
        cartao.appendChild(tit); cartao.appendChild(areaOutros);
        res.outros.forEach(o => adicionarLinhaProc(areaOutros, linhasOutros, o.descricao, o.valor));
      }
      if(!(res.itens || []).length && !(res.outros || []).length){
        cartao.appendChild(h('p', { style: 'font-size:13px;margin:6px 0;' }, ['Não entendi nenhum dente ou tratamento nessa frase. Tente falar, por exemplo: “dente 46, problema, canal, 1800 reais”. Você pode corrigir o texto acima e tocar em Interpretar.']));
      }
      const acoes = h('div', { style: 'display:flex;gap:8px;margin-top:8px;' });
      const aplicar = h('button', { type: 'button', class: 'av-b av-ok', style: 'flex:2;' }, ['✓ Aplicar ao odontograma']);
      const cancelar = h('button', { type: 'button', class: 'av-b av-s', style: 'flex:1;' }, ['Cancelar']);
      if(!(res.itens || []).length && !(res.outros || []).length){ aplicar.disabled = true; }
      acoes.appendChild(aplicar); acoes.appendChild(cancelar); cartao.appendChild(acoes);
      cancelar.onclick = () => { areaCartao.innerHTML = ''; };
      aplicar.onclick = () => {
        const resultado = { itens: [], outros: [] }; let problema = '';
        blocos.forEach(b => {
          if(!b.marcar.checked) return;
          const dente = parseInt(b.fDente.inp.value, 10);
          if(!window.VozParser.DENTES_VALIDOS.has(dente)){ problema = 'O número do dente "' + b.fDente.inp.value + '" não é válido.'; return; }
          const trat = b.linhasProc.filter(l => l.vivo).map(l => ({ tratamento: l.nome.inp.value.trim(), valor: lerDinheiro(l.valor.inp.value) })).filter(t => t.tratamento || t.valor !== null);
          resultado.itens.push({ dente, estado: b.sel.value === '' ? null : parseInt(b.sel.value, 10), situacao: b.fSit.inp.value.trim(), tratamentos: trat });
        });
        linhasOutros.filter(l => l.vivo).forEach(l => { const d = l.nome.inp.value.trim(); if(d) resultado.outros.push({ descricao: d, valor: lerDinheiro(l.valor.inp.value) }); });
        if(problema){ alert(problema); return; }
        if(!resultado.itens.length && !resultado.outros.length){ alert('Marque pelo menos um item para aplicar.'); return; }
        resultado.textoOriginal = textoOriginal;
        if(opcoes.aplicar) opcoes.aplicar(resultado);
        areaCartao.innerHTML = ''; caixa.value = ''; msg('Aplicado ao odontograma.', '#15803d');
      };
      areaCartao.appendChild(cartao);
    }

    function adicionarLinhaProc(area, lista, nome, valor){
      const fNome = campo('Tratamento', nome, 2); const fVal = campo('Valor', dinheiro(valor), 0.9);
      const rm = h('span', { style: 'color:#e53935;font-weight:700;cursor:pointer;align-self:flex-end;padding:6px;' }, ['✕']);
      const linha = h('div', { style: 'display:flex;gap:8px;align-items:flex-end;margin-bottom:6px;' }, [fNome.caixa, fVal.caixa, rm]);
      const reg = { nome: fNome, valor: fVal, vivo: true };
      rm.onclick = () => { reg.vivo = false; linha.remove(); };
      fVal.inp.onblur = () => { const n = lerDinheiro(fVal.inp.value); fVal.inp.value = n === null ? '' : dinheiro(n); };
      area.appendChild(linha); lista.push(reg);
    }

    carregarEstado();
    return raiz;
  };
})();
