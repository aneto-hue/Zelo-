// ============================================================
// DITADO POR VOZ (Web Speech API — nativo do navegador, sem custo)
// ------------------------------------------------------------
// Adiciona um botão de microfone ao lado de campos de texto, permitindo
// preencher falando em vez de digitar. Funciona bem no Chrome e no Edge
// (computador e Android). No Safari/iPhone o suporte é limitado ou
// inexistente — nesses casos o botão simplesmente não aparece (o
// microfone do próprio teclado do iPhone continua funcionando normal).
// ============================================================

function suportaDitado(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function criarBotaoDitado(inputEl){
  if(!suportaDitado()) return null;
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  const btn = document.createElement('span');
  btn.className = 'btn-ditado';
  btn.title = 'Ditar por voz';
  btn.textContent = '🎤';
  btn.style.cssText = 'cursor:pointer;font-size:17px;user-select:none;flex-shrink:0;line-height:1;padding:4px;';

  let reconhecendo = false;
  let recognition = null;

  function pararEscuta(){
    reconhecendo = false;
    btn.textContent = '🎤';
    btn.style.filter = 'none';
  }

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if(reconhecendo){
      if(recognition) recognition.stop();
      return;
    }
    recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;

    reconhecendo = true;
    btn.textContent = '🔴';
    btn.style.filter = 'drop-shadow(0 0 3px rgba(255,0,0,0.6))';

    recognition.onresult = (event) => {
      let textoNovo = '';
      for(let i = event.resultIndex; i < event.results.length; i++){
        if(event.results[i].isFinal){
          textoNovo += event.results[i][0].transcript;
        }
      }
      textoNovo = textoNovo.trim();
      if(textoNovo){
        const atual = inputEl.value || '';
        const precisaEspaco = atual && !/[\s\n]$/.test(atual);
        inputEl.value = atual + (precisaEspaco ? ' ' : '') + textoNovo;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    recognition.onerror = (event) => {
      pararEscuta();
      if(event.error !== 'no-speech' && event.error !== 'aborted'){
        alert('Não foi possível usar o microfone (' + event.error + '). Verifique se o navegador tem permissão de microfone para este site.');
      }
    };
    recognition.onend = pararEscuta;

    try{
      recognition.start();
    }catch(err){
      pararEscuta();
    }
  };

  return btn;
}

// Envolve um input/textarea já existente com um botão de microfone ao lado.
// Uso: no lugar de "container.appendChild(input)", usar "container.appendChild(comDitado(input))".
// Se o navegador não suportar ditado, devolve o próprio campo sem alteração (sem botão).
function comDitado(inputEl){
  const botao = criarBotaoDitado(inputEl);
  if(!botao) return inputEl;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%;';
  inputEl.style.flex = '1';
  inputEl.style.minWidth = '0';
  wrap.appendChild(inputEl);
  wrap.appendChild(botao);
  return wrap;
}
