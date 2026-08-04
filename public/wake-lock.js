// ============================================================
// MANTER A TELA SEMPRE ATIVA (Wake Lock API)
// ------------------------------------------------------------
// Evita que a tela do celular/tablet apague e bloqueie sozinha
// enquanto uma ficha está aberta — pensado pra não precisar tocar
// no aparelho com a luva contaminada durante o atendimento.
//
// Funciona no Chrome/Edge (Android e computador) e no Safari a
// partir do iOS 16.4. Onde não tiver suporte, o aviso simplesmente
// não aparece — nada quebra.
// ============================================================

let _wakeLockAtivo = null;
let _telaAtivaDesejada = false;

function suportaTelaSempreAtiva(){
  return 'wakeLock' in navigator;
}

function criarIndicadorTelaAtiva(){
  let badge = document.getElementById('indicadorTelaAtiva');
  if(badge) return badge;
  badge = document.createElement('div');
  badge.id = 'indicadorTelaAtiva';
  badge.style.cssText = 'position:fixed;bottom:18px;right:18px;background:rgba(46,139,87,0.94);color:#fff;padding:9px 16px;border-radius:22px;font-size:12.5px;font-weight:700;display:none;align-items:center;gap:7px;z-index:500;box-shadow:0 6px 18px rgba(0,0,0,0.28);cursor:pointer;user-select:none;transition:background .2s;';
  badge.innerHTML = '<span style="font-size:15px;">🔆</span><span id="indicadorTelaAtivaTexto">Tela sempre ativa</span>';
  badge.title = 'Toque para desativar';
  badge.onclick = () => {
    if(_wakeLockAtivo){
      _telaAtivaDesejada = false;
      desativarTelaSempreAtiva();
    } else {
      _telaAtivaDesejada = true;
      ativarTelaSempreAtiva();
    }
  };
  document.body.appendChild(badge);
  return badge;
}

function atualizarIndicadorTelaAtiva(ativo){
  if(!suportaTelaSempreAtiva()) return;
  const badge = criarIndicadorTelaAtiva();
  const texto = document.getElementById('indicadorTelaAtivaTexto');
  badge.style.display = 'flex';
  if(ativo){
    badge.style.background = 'rgba(46,139,87,0.94)';
    if(texto) texto.textContent = 'Tela sempre ativa';
    badge.title = 'Toque para desativar';
  } else {
    badge.style.background = 'rgba(90,90,95,0.9)';
    if(texto) texto.textContent = 'Tela pode apagar — toque aqui';
    badge.title = 'Toque para reativar';
  }
}

async function ativarTelaSempreAtiva(){
  if(!suportaTelaSempreAtiva()) return false;
  try{
    _wakeLockAtivo = await navigator.wakeLock.request('screen');
    _wakeLockAtivo.addEventListener('release', () => {
      // O navegador libera sozinho quando a página perde o foco (ex: troca de app,
      // tela apagou por outro motivo) — o listener de visibilitychange abaixo tenta
      // reativar automaticamente assim que a página volta a ficar visível.
      _wakeLockAtivo = null;
      if(_telaAtivaDesejada) atualizarIndicadorTelaAtiva(false);
    });
    atualizarIndicadorTelaAtiva(true);
    return true;
  }catch(e){
    atualizarIndicadorTelaAtiva(false);
    return false;
  }
}

function desativarTelaSempreAtiva(){
  if(_wakeLockAtivo){
    _wakeLockAtivo.release().catch(()=>{});
    _wakeLockAtivo = null;
  }
  const badge = document.getElementById('indicadorTelaAtiva');
  if(badge) badge.style.display = 'none';
}

document.addEventListener('visibilitychange', async () => {
  if(document.visibilityState === 'visible' && _telaAtivaDesejada && !_wakeLockAtivo){
    await ativarTelaSempreAtiva();
  }
});

// Chamar isso ao abrir uma ficha/prontuário — ativa automaticamente, sem precisar
// que a pessoa toque em nada (útil quando as mãos já estão com luva).
async function iniciarTelaSempreAtivaAutomaticamente(){
  _telaAtivaDesejada = true;
  await ativarTelaSempreAtiva();
}

// Chamar isso ao sair da ficha/voltar pra lista — libera a tela pra apagar normalmente de novo.
function pararTelaSempreAtiva(){
  _telaAtivaDesejada = false;
  desativarTelaSempreAtiva();
}
