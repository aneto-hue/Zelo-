// Botão "olhinho" de mostrar/ocultar senha, pra qualquer campo <input type="password">.
//
// É só incluir este arquivo na página (<script src="mostrar-senha.js"></script>) — ele acha os
// campos de senha que já existem e também os que a página criar depois (por exemplo, a janela
// de "Trocar minha senha"), e coloca o botão dentro de cada um, no canto direito.
//
// Cada campo é independente: mostrar a "senha atual" não mostra a "nova senha". O campo em si
// continua sendo o mesmo elemento de antes (mesmo id, mesmo valor, mesmos eventos) — só ganha
// um invólucro em volta pra posicionar o botão.
(function(){
  var ICONE_MOSTRAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICONE_OCULTAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  // O Edge já desenha um olhinho próprio nos campos de senha — esconde o dele pra não ficar
  // dois botões iguais um em cima do outro.
  var estilo = document.createElement('style');
  estilo.textContent = 'input[data-olho]::-ms-reveal, input[data-olho]::-ms-clear { display:none; }';
  (document.head || document.documentElement).appendChild(estilo);

  var botoes = []; // { input, botao, mostrando } — pra poder esconder tudo de novo, se precisar

  function atualizarBotao(item){
    item.botao.innerHTML = item.mostrando ? ICONE_OCULTAR : ICONE_MOSTRAR;
    item.botao.setAttribute('aria-label', item.mostrando ? 'Ocultar senha' : 'Mostrar senha');
    item.botao.setAttribute('aria-pressed', item.mostrando ? 'true' : 'false');
    item.botao.title = item.mostrando ? 'Ocultar senha' : 'Mostrar senha';
  }

  function alternar(item){
    var input = item.input;
    var ini = null, fim = null;
    try { ini = input.selectionStart; fim = input.selectionEnd; } catch(e){}
    item.mostrando = !item.mostrando;
    input.type = item.mostrando ? 'text' : 'password';
    atualizarBotao(item);
    // Mantém o cursor onde estava, pra a pessoa continuar digitando de onde parou.
    input.focus();
    try { if(ini !== null) input.setSelectionRange(ini, fim); } catch(e){}
  }

  function adicionarBotao(input){
    if(input.getAttribute('data-olho')) return; // já tem
    input.setAttribute('data-olho', '1');
    var pai = input.parentNode;
    if(!pai) return;

    var envolucro = document.createElement('div');
    envolucro.style.cssText = 'position:relative;display:block;width:100%;';
    pai.insertBefore(envolucro, input);
    envolucro.appendChild(input);

    // Sem isso o texto digitado passaria por baixo do ícone.
    input.style.display = 'block';
    input.style.paddingRight = '46px';

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.style.cssText = 'position:absolute;top:50%;right:6px;transform:translateY(-50%);width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:8px;padding:0;margin:0;cursor:pointer;opacity:.65;';
    // Pega a cor do texto do próprio campo, pra o ícone aparecer bem tanto nas telas claras
    // quanto na tela escura do Painel do Sistema.
    try { botao.style.color = getComputedStyle(input).color; } catch(e){}
    botao.onmouseenter = function(){ botao.style.opacity = '1'; };
    botao.onmouseleave = function(){ botao.style.opacity = '.65'; };
    // Evita o campo perder o foco (e o teclado do celular fechar) quando se toca no botão.
    botao.addEventListener('mousedown', function(e){ e.preventDefault(); });
    envolucro.appendChild(botao);

    var item = { input: input, botao: botao, mostrando: false };
    botao.addEventListener('click', function(){ alternar(item); });
    botoes.push(item);
    atualizarBotao(item);
  }

  function processar(raiz){
    if(!raiz || !raiz.querySelectorAll) return;
    if(raiz.matches && raiz.matches('input[type="password"]')) adicionarBotao(raiz);
    var campos = raiz.querySelectorAll('input[type="password"]');
    for(var i = 0; i < campos.length; i++) adicionarBotao(campos[i]);
  }

  function iniciar(){
    processar(document);
    // Campos criados depois (janelas, painéis que a página monta por JavaScript)
    new MutationObserver(function(mutacoes){
      mutacoes.forEach(function(m){
        for(var i = 0; i < m.addedNodes.length; i++){
          if(m.addedNodes[i].nodeType === 1) processar(m.addedNodes[i]);
        }
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Se a pessoa entrar, voltar pra esta página pelo botão "voltar" do navegador e o navegador
  // restaurar a tela do jeito que estava, a senha não pode reaparecer à mostra.
  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    botoes.forEach(function(item){
      if(item.mostrando){ item.mostrando = false; item.input.type = 'password'; atualizarBotao(item); }
    });
  });
})();
