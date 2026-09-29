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

  // IMPORTANTE: apesar do comentário "fire and forget" original, esta função PRECISA devolver
  // a Promise do fetch — muitos lugares do sistema fazem "await ClinicaStorage.save(...)"
  // esperando que o salvamento realmente tenha terminado antes de continuar (por exemplo, antes
  // de conferir se um lançamento persistiu no Financeiro). Sem o "return" aqui, esse await não
  // esperava nada de verdade — resolvia na hora, antes da requisição sequer chegar no servidor —
  // o que causava falsos "conflitos de salvamento simultâneo" mesmo com só uma pessoa usando o
  // sistema. Quem não precisa esperar continua podendo chamar sem "await", normalmente.
  save(key, value){
    return fetch('/api/storage/' + encodeURIComponent(key), {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(value)
    }).then(resp => {
      if(resp.status === 401) ClinicaStorage._irParaLogin();
      return resp;
    }).catch((e)=>{ console.error('Não foi possível salvar no servidor:', e); return null; });
  },

  _irParaLogin(){
    if(window.location.pathname.indexOf('login.html') !== -1) return;
    window.location.href = '/login.html?voltar=' + encodeURIComponent(window.location.pathname + window.location.search);
  }
};
