// ============================================================
// AUTENTICAÇÃO
// ------------------------------------------------------------
// Senhas: hash com scrypt (nativo do Node, sem depender de bcrypt).
// Sessões: token aleatório guardado em cookie httpOnly, conferido
// contra uma lista de sessões válidas guardada em arquivo.
// Portal do paciente: token de acesso avulso (sem senha), ligado
// a um paciente/ficha específico, com validade.
// ============================================================
const crypto = require('crypto');
const db = require('./db');

const SESSAO_DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const PORTAL_TOKEN_DURACAO_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias

// ---------- Senha ----------
function hashSenha(senhaTexto){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senhaTexto, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function conferirSenha(senhaTexto, senhaHashSalvo){
  if(!senhaHashSalvo || senhaHashSalvo.indexOf(':') === -1) return false;
  const [salt, hashSalvo] = senhaHashSalvo.split(':');
  const hashTentativa = crypto.scryptSync(senhaTexto, salt, 64).toString('hex');
  const bufA = Buffer.from(hashSalvo, 'hex');
  const bufB = Buffer.from(hashTentativa, 'hex');
  if(bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function gerarToken(){
  return crypto.randomBytes(24).toString('base64url');
}

// ---------- Sessões de profissionais ----------
function criarSessao(profissionalId){
  const sessoes = db.readTable('sessoes');
  const token = gerarToken();
  sessoes.push({ token, profissionalId, criadoEm: Date.now(), expiraEm: Date.now() + SESSAO_DURACAO_MS });
  db.writeTable('sessoes', sessoes);
  return token;
}
function validarSessao(token){
  if(!token) return null;
  const sessoes = db.readTable('sessoes');
  const sessao = sessoes.find(s => s.token === token);
  if(!sessao) return null;
  if(sessao.expiraEm < Date.now()) return null;
  const profissionais = db.readTable('profissionais');
  const prof = profissionais.find(p => p.id === sessao.profissionalId && p.ativo !== false);
  if(!prof) return null;
  return prof;
}
function encerrarSessao(token){
  const sessoes = db.readTable('sessoes').filter(s => s.token !== token);
  db.writeTable('sessoes', sessoes);
}

// ---------- Tokens do portal do paciente ----------
function criarTokenPaciente(clinicaId, pacienteId, fichaId){
  const tokens = db.readTable('tokens_paciente');
  const token = gerarToken();
  tokens.push({
    token, clinicaId, pacienteId, fichaId,
    criadoEm: Date.now(),
    expiraEm: Date.now() + PORTAL_TOKEN_DURACAO_MS,
    usadoEm: null
  });
  db.writeTable('tokens_paciente', tokens);
  return token;
}
function validarTokenPaciente(token){
  if(!token) return null;
  const tokens = db.readTable('tokens_paciente');
  const registro = tokens.find(t => t.token === token);
  if(!registro) return null;
  if(registro.expiraEm < Date.now()) return null;
  return registro;
}
function marcarTokenUsado(token){
  const tokens = db.readTable('tokens_paciente');
  const registro = tokens.find(t => t.token === token);
  if(registro) registro.usadoEm = Date.now();
  db.writeTable('tokens_paciente', tokens);
}

// ---------- Clínicas (cada uma é um espaço de dados isolado) ----------
function criarClinica(nome){
  const clinicas = db.readTable('clinicas');
  const nova = {
    id: 'cli' + crypto.randomBytes(8).toString('hex'),
    nome,
    criadoEm: Date.now(),
    ativa: true,
    assinaturaStatus: 'pendente', // 'pendente' | 'ativa' | 'atrasada' | 'cancelada'
    assinaturaVencimento: '',  // 'AAAA-MM-DD'
    mpPreapprovalId: '', // id da assinatura no Mercado Pago
    observacoes: ''
  };
  clinicas.push(nova);
  db.writeTable('clinicas', clinicas);
  return nova;
}
function buscarClinica(id){
  return db.readTable('clinicas').find(c => c.id === id) || null;
}

// ---------- Painel do dono do sistema (super-admin, separado de qualquer clínica) ----------
function criarSuperAdminInicial(){
  const email = process.env.SUPER_ADMIN_EMAIL;
  const senha = process.env.SUPER_ADMIN_SENHA;
  if(!email || !senha) return;
  const superAdmins = db.readTable('super_admins');
  if(superAdmins.some(a => a.email.toLowerCase() === email.toLowerCase())) return;
  superAdmins.push({
    id: 'sup' + crypto.randomBytes(8).toString('hex'),
    nome: 'Administrador do sistema',
    email: email.toLowerCase(),
    senhaHash: hashSenha(senha),
    criadoEm: Date.now()
  });
  db.writeTable('super_admins', superAdmins);
  console.log('');
  console.log('========================================================');
  console.log('  Painel do dono do sistema disponível em /painel-sistema-login.html');
  console.log('  E-mail: ' + email.toLowerCase());
  console.log('========================================================');
  console.log('');
}
function conferirLoginSuperAdmin(email, senha){
  const superAdmins = db.readTable('super_admins');
  const admin = superAdmins.find(a => a.email.toLowerCase() === String(email||'').toLowerCase());
  if(!admin || !conferirSenha(senha||'', admin.senhaHash)) return null;
  return admin;
}
function criarSessaoAdmin(superAdminId){
  const sessoes = db.readTable('sessoes_admin');
  const token = gerarToken();
  sessoes.push({ token, superAdminId, criadoEm: Date.now(), expiraEm: Date.now() + SESSAO_DURACAO_MS });
  db.writeTable('sessoes_admin', sessoes);
  return token;
}
function validarSessaoAdmin(token){
  if(!token) return null;
  const sessoes = db.readTable('sessoes_admin');
  const sessao = sessoes.find(s => s.token === token);
  if(!sessao) return null;
  if(sessao.expiraEm < Date.now()) return null;
  const superAdmins = db.readTable('super_admins');
  return superAdmins.find(a => a.id === sessao.superAdminId) || null;
}
function encerrarSessaoAdmin(token){
  const sessoes = db.readTable('sessoes_admin').filter(s => s.token !== token);
  db.writeTable('sessoes_admin', sessoes);
}

// ---------- Bootstrap: garante que existe pelo menos 1 administrador ----------
function avisoPrimeiroUso(){
  const profissionais = db.readTable('profissionais');
  const clinicas = db.readTable('clinicas');
  if(profissionais.length > 0 || clinicas.length > 0) return;
  console.log('');
  console.log('========================================================');
  console.log('  Nenhuma clínica cadastrada ainda.');
  console.log('  Acesse /criar-clinica.html para cadastrar a primeira clínica e o primeiro administrador.');
  console.log('========================================================');
  console.log('');
}

module.exports = {
  hashSenha, conferirSenha, gerarToken,
  criarSessao, validarSessao, encerrarSessao,
  criarTokenPaciente, validarTokenPaciente, marcarTokenUsado,
  criarClinica, buscarClinica,
  criarSuperAdminInicial, conferirLoginSuperAdmin, criarSessaoAdmin, validarSessaoAdmin, encerrarSessaoAdmin,
  avisoPrimeiroUso
};
