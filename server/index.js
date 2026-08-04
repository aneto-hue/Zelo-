// ============================================================
// SERVIDOR PRINCIPAL — Sistema da Clínica (hospedável)
// ------------------------------------------------------------
// Sem dependências externas: usa só módulos nativos do Node.
// - Login de profissionais (com senha)
// - Portal do paciente por link único (sem senha)
// - Armazenamento dos dados de cada módulo (fichas, agenda, estoque, financeiro)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');

const db = require('./db');
const auth = require('./auth');
const lembretes = require('./lembretes');
const whatsapp = require('./whatsapp');
const backupDrive = require('./backup-drive');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE_NOME = 'clinica_sessao';

db.readTable('profissionais'); // garante a pasta/estrutura
auth.avisoPrimeiroUso();
auth.criarSuperAdminInicial();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Páginas que podem ser acessadas SEM login (portal do paciente e a própria tela de login)
const PAGINAS_PUBLICAS = ['/', '/bem-vindo.html', '/login.html', '/criar-clinica.html', '/portal-paciente.html', '/ficha_dados_clinica.html', '/ficha_dados_paciente_saude.html', '/painel-sistema-login.html', '/favicon.ico'];
const ADMIN_COOKIE_NOME = 'painel_sistema_sessao';

// Monta uma chave de armazenamento isolada por clínica (cada clínica só enxerga os próprios dados)
function chaveEscopada(clinicaId, key){
  return 'clin' + clinicaId + '_' + key;
}

// ---------------- NÍVEIS DE ACESSO (quais módulos cada profissional pode usar) ----------------
// Um profissional com modulosPermitidos vazio (ou papel "admin") tem acesso a tudo — assim,
// profissionais já cadastrados antes dessa função existir continuam funcionando normalmente.
const PAGINA_PARA_MODULO = {
  '/anamnese.html': 'anamnese',
  '/prontuario.html': 'prontuario',
  '/agendamento.html': 'agendamento',
  '/estoque.html': 'estoque',
  '/financeiro.html': 'financeiro',
  '/pacientes.html': 'pacientes',
  '/paciente.html': 'pacientes',
  '/alertas.html': 'alertas',
};
function moduloDaChaveStorage(key){
  if(key.startsWith('ficha_anamnese_')) return 'anamnese';
  if(key.startsWith('ficha_prontuario_')) return 'prontuario';
  if(key.startsWith('modelos_') || key.startsWith('tipos_documento_custom') || key === 'catalogo_medicamentos_v1') return 'prontuario';
  if(key === 'controle_agendamento_progresso_v1') return 'agendamento';
  if(key === 'controle_estoque_progresso_v1') return 'estoque';
  if(key === 'controle_pagamentos_comissoes_v1') return 'financeiro';
  if(key === 'alertas_resolvidos_v1') return 'alertas';
  return null; // chaves compartilhadas (cadastro de pacientes, perfil da clínica etc.) — sem restrição
}
function temAcessoAoModulo(profissional, modulo){
  if(!modulo) return true;
  if(!profissional) return false;
  if(profissional.papel === 'admin') return true;
  const permitidos = profissional.modulosPermitidos;
  if(!Array.isArray(permitidos) || permitidos.length === 0) return true; // sem restrição configurada = acesso total
  return permitidos.includes(modulo);
}

function parseCookies(req){
  const header = req.headers.cookie;
  const out = {};
  if(!header) return out;
  header.split(';').forEach(par => {
    const idx = par.indexOf('=');
    if(idx === -1) return;
    const k = par.slice(0, idx).trim();
    const v = par.slice(idx+1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function enviarJSON(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function lerCorpo(req, callback){
  let chunks = [];
  let total = 0;
  const LIMITE = 50 * 1024 * 1024; // 50MB — fichas com fotos podem ficar grandes
  req.on('data', (chunk) => {
    total += chunk.length;
    if(total > LIMITE){ req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try{
      const body = Buffer.concat(chunks).toString('utf8');
      callback(null, body ? JSON.parse(body) : null);
    }catch(e){ callback(e, null); }
  });
}

function servirArquivoEstatico(res, pathname){
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'bem-vindo.html' : pathname);
  if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403); res.end('Acesso negado'); return; }
  fs.stat(filePath, (err, stats) => {
    if(err || !stats.isFile()){
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const cookies = parseCookies(req);
  let profissionalLogado = auth.validarSessao(cookies[COOKIE_NOME]);
  const superAdminLogado = auth.validarSessaoAdmin(cookies[ADMIN_COOKIE_NOME]);

  // Se a clínica do profissional foi desativada pelo dono do sistema, trata como deslogado.
  if(profissionalLogado){
    const clinicaDoProf = auth.buscarClinica(profissionalLogado.clinicaId);
    if(!clinicaDoProf || clinicaDoProf.ativa === false){
      profissionalLogado = null;
    }
  }

  // ---------------- CRIAR NOVA CLÍNICA (cadastro self-service) ----------------
  if(pathname === '/api/criar-clinica' && req.method === 'POST'){
    lerCorpo(req, (err, body) => {
      if(err || !body || !(body.nomeClinica||'').trim() || !(body.nomeAdmin||'').trim() || !(body.email||'').trim() || !(body.senha||'').trim()){
        enviarJSON(res, 400, { erro:'Preencha o nome da clínica, seu nome, e-mail e senha.' });
        return;
      }
      if((body.senha||'').length < 6){
        enviarJSON(res, 400, { erro:'A senha precisa ter pelo menos 6 caracteres.' });
        return;
      }
      const profissionaisExistentes = db.readTable('profissionais');
      if(profissionaisExistentes.some(p => p.email.toLowerCase() === body.email.toLowerCase())){
        enviarJSON(res, 409, { erro:'Já existe uma conta com esse e-mail. Tente entrar em vez de criar uma nova clínica.' });
        return;
      }

      const clinica = auth.criarClinica(body.nomeClinica.trim());
      const novoAdmin = {
        id: 'prof' + crypto.randomBytes(8).toString('hex'),
        clinicaId: clinica.id,
        nome: body.nomeAdmin.trim(),
        email: body.email.toLowerCase(),
        senhaHash: auth.hashSenha(body.senha),
        papel: 'admin',
        comissaoPercent: '',
        ativo: true,
        criadoEm: Date.now()
      };
      profissionaisExistentes.push(novoAdmin);
      db.writeTable('profissionais', profissionaisExistentes);

      // Já grava o nome da clínica no Perfil da Clínica, para o admin não precisar redigitar
      db.writeStorage(chaveEscopada(clinica.id, 'clinica_perfil_v1'), { nome: body.nomeClinica.trim() });

      const token = auth.criarSessao(novoAdmin.id);
      res.setHeader('Set-Cookie', `${COOKIE_NOME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax`);
      enviarJSON(res, 200, { ok:true });
    });
    return;
  }

  // ---------------- PAINEL DO DONO DO SISTEMA (super-admin, separado das clínicas) ----------------
  if(pathname === '/api/sistema/login' && req.method === 'POST'){
    lerCorpo(req, (err, body) => {
      if(err || !body){ enviarJSON(res, 400, { erro:'Requisição inválida' }); return; }
      const admin = auth.conferirLoginSuperAdmin(body.email, body.senha);
      if(!admin){ enviarJSON(res, 401, { erro:'E-mail ou senha incorretos' }); return; }
      const token = auth.criarSessaoAdmin(admin.id);
      res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NOME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax`);
      enviarJSON(res, 200, { ok:true, nome: admin.nome });
    });
    return;
  }

  if(pathname === '/api/sistema/logout' && req.method === 'POST'){
    if(cookies[ADMIN_COOKIE_NOME]) auth.encerrarSessaoAdmin(cookies[ADMIN_COOKIE_NOME]);
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NOME}=; HttpOnly; Path=/; Max-Age=0`);
    enviarJSON(res, 200, { ok:true });
    return;
  }

  if(pathname === '/api/sistema/me' && req.method === 'GET'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    enviarJSON(res, 200, { nome: superAdminLogado.nome, email: superAdminLogado.email });
    return;
  }

  if(pathname === '/api/sistema/clinicas' && req.method === 'GET'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    const clinicas = db.readTable('clinicas');
    const profissionais = db.readTable('profissionais');
    const lista = clinicas.map(c => ({
      id: c.id, nome: c.nome, criadoEm: c.criadoEm,
      ativa: c.ativa !== false,
      assinaturaStatus: c.assinaturaStatus || 'teste',
      assinaturaVencimento: c.assinaturaVencimento || '',
      observacoes: c.observacoes || '',
      totalProfissionais: profissionais.filter(p => p.clinicaId === c.id && p.ativo !== false).length
    })).sort((a,b) => b.criadoEm - a.criadoEm);
    enviarJSON(res, 200, { clinicas: lista });
    return;
  }

  if(pathname.startsWith('/api/sistema/clinicas/') && req.method === 'PUT'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    const id = pathname.replace('/api/sistema/clinicas/', '');
    const clinicas = db.readTable('clinicas');
    const idx = clinicas.findIndex(c => c.id === id);
    if(idx === -1){ enviarJSON(res, 404, { erro:'Clínica não encontrada' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body){ enviarJSON(res, 400, { erro:'Requisição inválida' }); return; }
      if(body.ativa !== undefined) clinicas[idx].ativa = !!body.ativa;
      if(body.assinaturaStatus !== undefined) clinicas[idx].assinaturaStatus = body.assinaturaStatus;
      if(body.assinaturaVencimento !== undefined) clinicas[idx].assinaturaVencimento = body.assinaturaVencimento;
      if(body.observacoes !== undefined) clinicas[idx].observacoes = body.observacoes;
      db.writeTable('clinicas', clinicas);
      enviarJSON(res, 200, { ok:true });
    });
    return;
  }

  if(pathname === '/api/sistema/whatsapp-status' && req.method === 'GET'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    enviarJSON(res, 200, { configurado: whatsapp.credenciaisConfiguradas() });
    return;
  }

  // Recuperação de senha: o dono do sistema gera uma nova senha temporária pro
  // administrador de uma clínica (usado quando ninguém na clínica consegue mais entrar).
  if(pathname.startsWith('/api/sistema/resetar-senha-admin/') && req.method === 'POST'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    const clinicaId = pathname.replace('/api/sistema/resetar-senha-admin/', '');
    const profissionais = db.readTable('profissionais');
    const idx = profissionais.findIndex(p => p.clinicaId === clinicaId && p.papel === 'admin' && p.ativo !== false);
    if(idx === -1){ enviarJSON(res, 404, { erro:'Nenhum administrador ativo encontrado nessa clínica.' }); return; }
    const novaSenha = Math.random().toString(36).slice(2,6) + '-' + Math.random().toString(36).slice(2,6);
    profissionais[idx].senhaHash = auth.hashSenha(novaSenha);
    db.writeTable('profissionais', profissionais);
    enviarJSON(res, 200, { ok:true, email: profissionais[idx].email, novaSenha });
    return;
  }

  if(pathname === '/api/sistema/testar-lembretes' && req.method === 'POST'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    lembretes.verificarLembretesTodasClinicas().then(resumo => {
      enviarJSON(res, 200, { ok:true, resumo });
    }).catch(e => {
      enviarJSON(res, 500, { erro: e.message });
    });
    return;
  }

  // ---------------- BACKUP (manual + automático para o Google Drive) ----------------
  if(pathname === '/api/sistema/backup-status' && req.method === 'GET'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    enviarJSON(res, 200, { googleConfigurado: backupDrive.credenciaisConfiguradas() });
    return;
  }

  if(pathname === '/api/sistema/backup-agora' && req.method === 'POST'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    backupDrive.fazerBackupCompleto().then(resultado => {
      if(resultado.ok) enviarJSON(res, 200, { ok:true });
      else enviarJSON(res, 500, { erro: typeof resultado.erro === 'string' ? resultado.erro : 'Não foi possível enviar o backup ao Google Drive.' });
    }).catch(e => enviarJSON(res, 500, { erro: e.message }));
    return;
  }

  if(pathname === '/api/sistema/backup-baixar' && req.method === 'GET'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    try{
      const backup = db.exportarTudo();
      const json = JSON.stringify(backup);
      const carimbo = new Date().toISOString().replace(/[:.]/g,'-');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="backup-clinica-' + carimbo + '.json"'
      });
      res.end(json);
    }catch(e){
      enviarJSON(res, 500, { erro: 'Não foi possível gerar o backup: ' + e.message });
    }
    return;
  }

  if(pathname === '/api/sistema/backup-restaurar' && req.method === 'POST'){
    if(!superAdminLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body){ enviarJSON(res, 400, { erro:'Arquivo de backup inválido ou corrompido.' }); return; }
      try{
        const resultado = db.restaurarTudo(body);
        enviarJSON(res, 200, { ok:true, ...resultado });
      }catch(e){
        enviarJSON(res, 500, { erro: 'Não foi possível restaurar: ' + e.message });
      }
    });
    return;
  }

  // ---------------- ROTAS DE AUTENTICAÇÃO ----------------
  if(pathname === '/api/login' && req.method === 'POST'){
    lerCorpo(req, (err, body) => {
      if(err || !body){ enviarJSON(res, 400, { erro:'Requisição inválida' }); return; }
      const { email, senha } = body;
      const profissionais = db.readTable('profissionais');
      const prof = profissionais.find(p => (p.email||'').toLowerCase() === String(email||'').toLowerCase() && p.ativo !== false);
      if(!prof || !auth.conferirSenha(senha||'', prof.senhaHash)){
        enviarJSON(res, 401, { erro:'E-mail ou senha incorretos' });
        return;
      }
      const clinicaDoProf = auth.buscarClinica(prof.clinicaId);
      if(!clinicaDoProf || clinicaDoProf.ativa === false){
        enviarJSON(res, 403, { erro:'O acesso desta clínica está temporariamente suspenso. Entre em contato com o suporte.' });
        return;
      }
      const token = auth.criarSessao(prof.id);
      res.setHeader('Set-Cookie', `${COOKIE_NOME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax`);
      enviarJSON(res, 200, { ok:true, nome: prof.nome, papel: prof.papel });
    });
    return;
  }

  if(pathname === '/api/logout' && req.method === 'POST'){
    if(cookies[COOKIE_NOME]) auth.encerrarSessao(cookies[COOKIE_NOME]);
    res.setHeader('Set-Cookie', `${COOKIE_NOME}=; HttpOnly; Path=/; Max-Age=0`);
    enviarJSON(res, 200, { ok:true });
    return;
  }

  if(pathname === '/api/minha-senha' && req.method === 'POST'){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body || !body.senhaAtual || !body.novaSenha){
        enviarJSON(res, 400, { erro:'Preencha a senha atual e a nova senha.' }); return;
      }
      if(String(body.novaSenha).length < 6){
        enviarJSON(res, 400, { erro:'A nova senha precisa ter pelo menos 6 caracteres.' }); return;
      }
      const profissionais = db.readTable('profissionais');
      const idx = profissionais.findIndex(p => p.id === profissionalLogado.id);
      if(idx === -1){ enviarJSON(res, 404, { erro:'Conta não encontrada.' }); return; }
      if(!auth.conferirSenha(body.senhaAtual, profissionais[idx].senhaHash)){
        enviarJSON(res, 401, { erro:'Senha atual incorreta.' }); return;
      }
      profissionais[idx].senhaHash = auth.hashSenha(body.novaSenha);
      db.writeTable('profissionais', profissionais);
      enviarJSON(res, 200, { ok:true });
    });
    return;
  }

  if(pathname === '/api/me' && req.method === 'GET'){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    enviarJSON(res, 200, {
      id: profissionalLogado.id, nome: profissionalLogado.nome, email: profissionalLogado.email, papel: profissionalLogado.papel,
      modulosPermitidos: Array.isArray(profissionalLogado.modulosPermitidos) ? profissionalLogado.modulosPermitidos : []
    });
    return;
  }

  // ---------------- GESTÃO DE PROFISSIONAIS (só admin, escopado pela clínica) ----------------
  if(pathname === '/api/profissionais' && req.method === 'GET'){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    const lista = db.readTable('profissionais')
      .filter(p => p.clinicaId === profissionalLogado.clinicaId)
      .map(p => ({
        id: p.id, nome: p.nome, email: p.email, papel: p.papel, cargo: p.cargo || '', comissaoPercent: p.comissaoPercent, ativo: p.ativo !== false,
        modulosPermitidos: Array.isArray(p.modulosPermitidos) ? p.modulosPermitidos : []
      }));
    enviarJSON(res, 200, { profissionais: lista });
    return;
  }

  if(pathname === '/api/profissionais' && req.method === 'POST'){
    if(!profissionalLogado || profissionalLogado.papel !== 'admin'){ enviarJSON(res, 403, { erro:'Apenas administradores podem gerenciar profissionais' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body || !(body.nome||'').trim() || !(body.email||'').trim() || !(body.senha||'').trim()){
        enviarJSON(res, 400, { erro:'Preencha nome, e-mail e senha' }); return;
      }
      const profissionais = db.readTable('profissionais');
      if(profissionais.some(p => p.email.toLowerCase() === body.email.toLowerCase())){
        enviarJSON(res, 409, { erro:'Já existe um profissional com esse e-mail' }); return;
      }
      const novo = {
        id: 'prof' + crypto.randomBytes(8).toString('hex'),
        clinicaId: profissionalLogado.clinicaId,
        nome: body.nome, email: body.email.toLowerCase(),
        senhaHash: auth.hashSenha(body.senha),
        papel: body.papel === 'admin' ? 'admin' : 'profissional',
        cargo: body.cargo || '',
        comissaoPercent: body.comissaoPercent || '',
        modulosPermitidos: Array.isArray(body.modulosPermitidos) ? body.modulosPermitidos : [], // vazio = acesso a tudo
        ativo: true, criadoEm: Date.now()
      };
      profissionais.push(novo);
      db.writeTable('profissionais', profissionais);
      enviarJSON(res, 200, { ok:true, id: novo.id });
    });
    return;
  }

  if(pathname.startsWith('/api/profissionais/') && (req.method === 'PUT' || req.method === 'DELETE')){
    if(!profissionalLogado || profissionalLogado.papel !== 'admin'){ enviarJSON(res, 403, { erro:'Apenas administradores podem gerenciar profissionais' }); return; }
    const id = pathname.replace('/api/profissionais/', '');
    const profissionais = db.readTable('profissionais');
    const idx = profissionais.findIndex(p => p.id === id);
    if(idx === -1 || profissionais[idx].clinicaId !== profissionalLogado.clinicaId){ enviarJSON(res, 404, { erro:'Profissional não encontrado' }); return; }

    if(req.method === 'DELETE'){
      profissionais[idx].ativo = false; // desativa em vez de apagar, para não perder histórico
      db.writeTable('profissionais', profissionais);
      enviarJSON(res, 200, { ok:true });
      return;
    }
    lerCorpo(req, (err, bodyMod) => {
      if(err){ enviarJSON(res, 400, { erro:'Requisição inválida' }); return; }
      if(bodyMod.nome) profissionais[idx].nome = bodyMod.nome;
      if(bodyMod.papel) profissionais[idx].papel = bodyMod.papel === 'admin' ? 'admin' : 'profissional';
      if(bodyMod.comissaoPercent !== undefined) profissionais[idx].comissaoPercent = bodyMod.comissaoPercent;
      if(bodyMod.modulosPermitidos !== undefined) profissionais[idx].modulosPermitidos = Array.isArray(bodyMod.modulosPermitidos) ? bodyMod.modulosPermitidos : [];
      if(bodyMod.senha) profissionais[idx].senhaHash = auth.hashSenha(bodyMod.senha);
      if(bodyMod.ativo !== undefined) profissionais[idx].ativo = !!bodyMod.ativo;
      db.writeTable('profissionais', profissionais);
      enviarJSON(res, 200, { ok:true });
    });
    return;
  }

  // ---------------- PORTAL DO PACIENTE (link com token, sem senha) ----------------
  if(pathname === '/api/portal/gerar-link' && req.method === 'POST'){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body || !body.pacienteId){ enviarJSON(res, 400, { erro:'Informe o paciente' }); return; }
      const token = auth.criarTokenPaciente(profissionalLogado.clinicaId, body.pacienteId, body.fichaId || null);
      enviarJSON(res, 200, { ok:true, token, url: '/portal-paciente.html?token=' + token });
    });
    return;
  }

  if(pathname === '/api/portal/dados' && req.method === 'GET'){
    const token = parsed.query.token;
    const registro = auth.validarTokenPaciente(token);
    if(!registro){ enviarJSON(res, 401, { erro:'Link inválido ou expirado. Peça um novo link para a clínica.' }); return; }
    const pacientes = db.readStorage(chaveEscopada(registro.clinicaId, 'clinica_pacientes_registro_v1')) || [];
    const paciente = pacientes.find(p => p.id === registro.pacienteId);
    const dadosFicha = registro.fichaId ? db.readStorage(chaveEscopada(registro.clinicaId, 'ficha_anamnese_paciente_' + registro.fichaId)) : null;
    enviarJSON(res, 200, {
      paciente: paciente || { nome:'' },
      ficha: dadosFicha ? { patient: dadosFicha.patient, general: dadosFicha.general, oral: dadosFicha.oral, diseases: dadosFicha.diseases } : null
    });
    return;
  }

  if(pathname === '/api/portal/salvar' && req.method === 'POST'){
    lerCorpo(req, (err, body) => {
      if(err || !body || !body.token){ enviarJSON(res, 400, { erro:'Requisição inválida' }); return; }
      const registro = auth.validarTokenPaciente(body.token);
      if(!registro){ enviarJSON(res, 401, { erro:'Link inválido ou expirado. Peça um novo link para a clínica.' }); return; }

      // Atualiza o cadastro central do paciente (o mesmo usado por shared-data.js em todos os módulos)
      const chavePacientes = chaveEscopada(registro.clinicaId, 'clinica_pacientes_registro_v1');
      const pacientes = db.readStorage(chavePacientes) || [];
      const paciente = pacientes.find(p => p.id === registro.pacienteId);
      if(paciente && body.patient){
        ['nome','nasc','sexo','telefone','cpf','rg','endereco','email'].forEach(k=>{
          if(body.patient[k]) paciente[k] = body.patient[k];
        });
        paciente.atualizadoEm = Date.now();
        db.writeStorage(chavePacientes, pacientes);
      }

      // Atualiza a ficha vinculada (se houver) com os dados de saúde preenchidos pelo paciente
      if(registro.fichaId){
        const chave = chaveEscopada(registro.clinicaId, 'ficha_anamnese_paciente_' + registro.fichaId);
        const fichaAtual = db.readStorage(chave) || {};
        if(body.patient) fichaAtual.patient = Object.assign({}, fichaAtual.patient, body.patient);
        if(body.general) fichaAtual.general = Object.assign({}, fichaAtual.general, body.general);
        if(body.oral) fichaAtual.oral = Object.assign({}, fichaAtual.oral, body.oral);
        if(body.diseases) fichaAtual.diseases = Object.assign({}, fichaAtual.diseases, body.diseases);
        fichaAtual.preenchidoPeloPacienteEm = Date.now();
        db.writeStorage(chave, fichaAtual);
      }

      auth.marcarTokenUsado(body.token);
      enviarJSON(res, 200, { ok:true });
    });
    return;
  }

  // ---------------- NOTIFICAR PROFISSIONAL: PACIENTE AGUARDANDO (WhatsApp) ----------------
  if(pathname === '/api/notificar-paciente-aguardando' && req.method === 'POST'){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    lerCorpo(req, (err, body) => {
      if(err || !body || !body.telefoneProfissional || !body.nomePaciente){
        enviarJSON(res, 400, { erro:'Faltam dados (telefone do profissional e nome do paciente).' }); return;
      }
      whatsapp.notificarProfissionalAguardando(body.telefoneProfissional, body.nomePaciente).then(resultado => {
        enviarJSON(res, 200, { ok:true, simulado: !!resultado.simulado });
      }).catch(e => enviarJSON(res, 500, { erro: e.message }));
    });
    return;
  }

  // ---------------- ARMAZENAMENTO GENÉRICO (fichas, agenda, estoque, financeiro) ----------------
  if(pathname.startsWith('/api/storage/')){
    if(!profissionalLogado){ enviarJSON(res, 401, { erro:'Não autenticado' }); return; }
    const key = pathname.replace('/api/storage/', '');
    if(!/^[a-zA-Z0-9_-]+$/.test(key)){ enviarJSON(res, 400, { erro:'Chave inválida' }); return; }
    if(!temAcessoAoModulo(profissionalLogado, moduloDaChaveStorage(key))){
      enviarJSON(res, 403, { erro:'Você não tem permissão de acesso a este módulo. Fale com um administrador da clínica.' });
      return;
    }
    const chaveReal = chaveEscopada(profissionalLogado.clinicaId, key);

    if(req.method === 'GET'){
      enviarJSON(res, 200, { value: db.readStorage(chaveReal) });
      return;
    }
    if(req.method === 'POST' || req.method === 'PUT'){
      lerCorpo(req, (err, body) => {
        if(err){ enviarJSON(res, 400, { erro:'JSON inválido' }); return; }
        db.writeStorage(chaveReal, body);
        enviarJSON(res, 200, { ok:true });
      });
      return;
    }
    if(req.method === 'DELETE'){
      db.writeStorage(chaveReal, null);
      enviarJSON(res, 200, { ok:true });
      return;
    }
    enviarJSON(res, 405, { erro:'Método não permitido' });
    return;
  }

  // ---------------- ARQUIVOS ESTÁTICOS (protegidos por login, exceto páginas públicas) ----------------
  if(req.method === 'GET'){
    if(pathname === '/painel-sistema.html'){
      if(!superAdminLogado){
        res.writeHead(302, { Location: '/painel-sistema-login.html' });
        res.end();
        return;
      }
      servirArquivoEstatico(res, pathname);
      return;
    }
    const ehPublica = PAGINAS_PUBLICAS.includes(pathname) || pathname.startsWith('/client-storage.js') || pathname.startsWith('/shared-data.js');
    if(!ehPublica && !profissionalLogado && (pathname === '/' || pathname.endsWith('.html'))){
      res.writeHead(302, { Location: '/login.html' });
      res.end();
      return;
    }
    if(profissionalLogado && PAGINA_PARA_MODULO[pathname] && !temAcessoAoModulo(profissionalLogado, PAGINA_PARA_MODULO[pathname])){
      res.writeHead(302, { Location: '/index.html?sem_acesso=1' });
      res.end();
      return;
    }
    servirArquivoEstatico(res, pathname);
  } else {
    res.writeHead(405); res.end('Método não permitido');
  }
});

function listarIPsLocais(){
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.keys(interfaces).forEach(nome => {
    (interfaces[nome] || []).forEach(iface => {
      if(iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    });
  });
  return ips;
}

server.listen(PORT, () => {
  console.log('');
  console.log('========================================================');
  console.log('  Servidor da Clínica rodando na porta ' + PORT);
  console.log('========================================================');
  console.log('  Local: http://localhost:' + PORT);
  const ips = listarIPsLocais();
  ips.forEach(ip => console.log('  Rede:  http://' + ip + ':' + PORT));
  console.log('========================================================');
  console.log('');
  if(!whatsapp.credenciaisConfiguradas()){
    console.log('  [Lembretes de retorno] WHATSAPP_360DIALOG_API_KEY não configurada — envios ficam apenas simulados (log no console).');
    console.log('');
  }
  if(!backupDrive.credenciaisConfiguradas()){
    console.log('  [Backup automático] Credenciais do Google Drive não configuradas — backup automático desativado (o backup manual continua disponível no Painel do Sistema).');
    console.log('');
  }
  // Roda a checagem de lembretes de retorno uma vez ao iniciar, e depois a cada 24 horas.
  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => { lembretes.verificarLembretesTodasClinicas(); }, 10 * 1000);
  setInterval(() => { lembretes.verificarLembretesTodasClinicas(); }, UM_DIA_MS);
  // Faz backup automático para o Google Drive uma vez ao iniciar (se configurado), e depois a cada 24 horas.
  setTimeout(() => { if(backupDrive.credenciaisConfiguradas()) backupDrive.fazerBackupCompleto(); }, 20 * 1000);
  setInterval(() => { if(backupDrive.credenciaisConfiguradas()) backupDrive.fazerBackupCompleto(); }, UM_DIA_MS);
});
