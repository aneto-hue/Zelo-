// ============================================================
// ARMAZENAMENTO VIA SERVIDOR (autenticado)
// ------------------------------------------------------------
// Todas as leituras/gravações passam pelo servidor. Se a sessão
// não for válida (não logado, ou sessão expirada), o servidor
// responde 401 e este arquivo redireciona para a tela de login.
// ============================================================

const ClinicaStorage = {
  async load(key){
    try{
      const resp = await fetch('/api/storage/' + encodeURIComponent(key), { credentials:'same-origin' });
      if(resp.status === 401){ ClinicaStorage._irParaLogin(); return null; }
      const data = await resp.json();
      return data ? data.value : null;
    }catch(e){
      console.error('Não foi possível carregar dados do servidor:', e);
      return null;
    }
  },

  // "Fire and forget": não trava a tela esperando salvar.
  save(key, value){
    fetch('/api/storage/' + encodeURIComponent(key), {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(value)
    }).then(resp => {
      if(resp.status === 401) ClinicaStorage._irParaLogin();
    }).catch(()=>{ /* falha de rede pontual: próxima tentativa de salvar cobre isso */ });
  },

  _irParaLogin(){
    if(window.location.pathname.indexOf('login.html') !== -1) return;
    window.location.href = '/login.html?voltar=' + encodeURIComponent(window.location.pathname + window.location.search);
  }
};
