// ============================================================
// BOTÃO "VOLTAR AO INÍCIO"
// ------------------------------------------------------------
// Incluído em todas as páginas internas do sistema (exceto a própria
// tela inicial, login e portal do paciente). Insere um botão fixo
// no cabeçalho que leva direto para index.html, sem precisar usar o
// botão "voltar" do navegador.
// ============================================================
(function(){
  function inserirBotao(){
    var header = document.querySelector('header.topbar');
    if(!header) return;
    if(document.getElementById('homeNavBtn')) return; // evita duplicar

    var btn = document.createElement('a');
    btn.id = 'homeNavBtn';
    btn.href = 'index.html';
    btn.setAttribute('aria-label', 'Voltar ao início');
    btn.title = 'Voltar ao início';
    btn.className = 'home-nav-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:19px;height:19px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>';
    header.appendChild(btn);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inserirBotao);
  } else {
    inserirBotao();
  }
})();
