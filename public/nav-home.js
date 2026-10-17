// ============================================================
// CABEÇALHO PADRÃO DOS MÓDULOS
// ------------------------------------------------------------
// Incluído em todas as páginas internas do sistema (exceto a própria
// tela inicial, login e portal do paciente). Transforma o
// <header class="topbar"> de cada módulo em uma barra compacta com:
//   - logo da Zelo (leva ao menu principal)
//   - botões Voltar / Avançar / Início
//   - título e subtítulo do módulo (o mesmo HTML que já existia)
//   - abas do módulo (nav#stepsNav), quando houver
//   - logo e nome da clínica logada + nome do usuário
// Nenhuma página precisa ser alterada: o script reaproveita os
// elementos que já existem (os ids continuam funcionando).
// ============================================================
(function(){
  var URL_INICIO = 'index.html';
  var LOGO_ZELO = 'img/logo-zelo.svg';

  var ICONES = {
    voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    avancar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    casa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>'
  };

  function iniciais(nome){
    var partes = String(nome || '').trim().split(/\s+/).filter(function(p){ return p.length > 2; });
    if(!partes.length) partes = String(nome || '?').trim().split(/\s+/);
    return partes.slice(0, 2).map(function(p){ return p.charAt(0).toUpperCase(); }).join('') || '?';
  }

  function criar(tag, classe, html){
    var el = document.createElement(tag);
    if(classe) el.className = classe;
    if(html) el.innerHTML = html;
    return el;
  }

  function montar(){
    var header = document.querySelector('header.topbar');
    if(!header || header.classList.contains('zb-topbar')) return;
    header.classList.add('zb-topbar');

    // 1) Junta o conteúdo original (h1, p, links...) num bloco de título
    var titulo = criar('div', 'zb-titulo');
    while(header.firstChild) titulo.appendChild(header.firstChild);

    // 2) Logo da Zelo
    var logo = criar('a', 'zb-logo-sistema');
    logo.href = URL_INICIO;
    logo.title = 'Zelo – menu principal';
    var img = document.createElement('img');
    img.src = LOGO_ZELO;
    img.alt = 'Zelo';
    img.onerror = function(){ logo.innerHTML = '<span class="zb-logo-texto">zelo</span>'; };
    logo.appendChild(img);

    // 3) Voltar / Avançar / Início
    var nav = criar('nav', 'zb-nav');
    nav.setAttribute('aria-label', 'Navegação');
    var btnVoltar = criar('button', 'zb-btn', ICONES.voltar);
    btnVoltar.type = 'button'; btnVoltar.title = 'Voltar'; btnVoltar.setAttribute('aria-label', 'Voltar');
    var btnAvancar = criar('button', 'zb-btn', ICONES.avancar);
    btnAvancar.type = 'button'; btnAvancar.title = 'Avançar'; btnAvancar.setAttribute('aria-label', 'Avançar');
    var btnInicio = criar('a', 'zb-btn zb-inicio', ICONES.casa + '<span>Início</span>');
    btnInicio.id = 'homeNavBtn';
    btnInicio.href = URL_INICIO;
    btnInicio.title = 'Voltar ao menu principal';

    btnVoltar.onclick = function(){
      if(history.length > 1) history.back(); else window.location.href = URL_INICIO;
    };
    btnAvancar.onclick = function(){ history.forward(); };
    // Navegadores que informam o histórico (Chrome/Edge) desativam o "Avançar" quando não há para onde ir
    if(window.navigation && 'canGoForward' in window.navigation){
      btnAvancar.disabled = !window.navigation.canGoForward;
    }

    nav.appendChild(btnVoltar);
    nav.appendChild(btnAvancar);
    nav.appendChild(criar('span', 'zb-divisor'));
    nav.appendChild(btnInicio);

    // 4) Área das abas do módulo
    var extra = criar('div', 'zb-extra');
    var steps = document.getElementById('stepsNav');
    if(steps) extra.appendChild(steps);

    // 5) Clínica logada
    var clinica = criar('div', 'zb-clinica');
    clinica.innerHTML = '<span class="zb-clinica-logo"></span>' +
      '<div class="zb-clinica-info"><div class="zb-clinica-nome"></div><div class="zb-clinica-usuario"></div></div>';
    clinica.hidden = true;

    header.appendChild(logo);
    header.appendChild(nav);
    header.appendChild(titulo);
    header.appendChild(extra);
    header.appendChild(clinica);

    carregarClinica(clinica);
    ajustarQuebra(header, titulo, extra);
  }

  function preencherClinica(caixa, perfil, usuario){
    if(perfil){
      var nome = perfil.nome || '';
      caixa.querySelector('.zb-clinica-nome').textContent = nome;
      caixa.title = nome;
      var logoBox = caixa.querySelector('.zb-clinica-logo');
      logoBox.innerHTML = '';
      if(perfil.logo){
        var img = document.createElement('img');
        img.src = perfil.logo;
        img.alt = 'Logo ' + nome;
        img.onerror = function(){ logoBox.textContent = iniciais(nome); };
        logoBox.appendChild(img);
      } else {
        logoBox.textContent = iniciais(nome);
      }
      if(nome || perfil.logo){
        caixa.hidden = false;
        window.dispatchEvent(new Event('resize')); // reavalia se as abas ainda cabem na linha
      }
    }
    if(usuario){
      caixa.querySelector('.zb-clinica-usuario').textContent = usuario;
    }
  }

  function carregarClinica(caixa){
    // Perfil da clínica (nome e logo)
    // (ClinicaStorage é declarado com "const" em client-storage.js, então não fica em window.)
    if(typeof ClinicaStorage !== 'undefined' && ClinicaStorage.load){
      ClinicaStorage.load('clinica_perfil_v1').then(function(perfil){
        preencherClinica(caixa, perfil, null);
      }).catch(function(){});
    }
    // Usuário logado
    fetch('/api/me', { credentials:'same-origin' }).then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(me){
      if(me && me.nome) preencherClinica(caixa, null, me.nome);
    }).catch(function(){});
  }

  // Se as abas não couberem na mesma linha, elas descem para uma segunda linha
  // dentro do próprio cabeçalho (a clínica continua no canto superior direito).
  function ajustarQuebra(header, titulo, extra){
    var clinica = header.querySelector('.zb-clinica');
    function desceu(el){ return el && el.offsetParent !== null && el.offsetTop > titulo.offsetTop + 8; }
    function ajustar(){
      header.classList.remove('zb-quebra');
      if(!extra.firstChild || extra.offsetParent === null) return;
      if(window.matchMedia && window.matchMedia('(max-width:760px)').matches) return;
      if(desceu(extra) || desceu(clinica)) header.classList.add('zb-quebra');
    }
    var agendado = false;
    function agendar(){
      if(agendado) return;
      agendado = true;
      requestAnimationFrame(function(){ agendado = false; ajustar(); });
    }
    window.addEventListener('resize', agendar);
    if(window.MutationObserver){
      new MutationObserver(agendar).observe(extra, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class'] });
    }
    agendar();
    window.addEventListener('load', agendar);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
