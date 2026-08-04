// ============================================================
// BACKUP AUTOMÁTICO PARA O GOOGLE DRIVE
// ------------------------------------------------------------
// Usa uma "conta de serviço" do Google (não é o login pessoal do
// dono do sistema) — configurada uma única vez, nas variáveis de
// ambiente do servidor:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  -> e-mail da conta de serviço
//   GOOGLE_SERVICE_ACCOUNT_KEY    -> chave privada (do arquivo .json baixado do Google Cloud)
//   GOOGLE_DRIVE_FOLDER_ID        -> ID da pasta do Google Drive compartilhada com a conta de serviço
//
// Sem nenhuma biblioteca externa: monta e assina o token de acesso
// (JWT) manualmente com o módulo "crypto" nativo do Node.
// ============================================================
const crypto = require('crypto');
const db = require('./db');
const zlib = require('zlib');

function credenciaisConfiguradas(){
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function base64url(bufferOuString){
  const buf = Buffer.isBuffer(bufferOuString) ? bufferOuString : Buffer.from(bufferOuString, 'utf8');
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Monta e assina o JWT exigido pelo Google para autenticar a conta de serviço (RS256)
function criarJWT(email, chavePrivada, escopo){
  const agora = Math.floor(Date.now()/1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claims = {
    iss: email,
    scope: escopo,
    aud: 'https://oauth2.googleapis.com/token',
    exp: agora + 3600,
    iat: agora
  };
  const entrada = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const assinador = crypto.createSign('RSA-SHA256');
  assinador.update(entrada);
  assinador.end();
  const assinatura = assinador.sign(chavePrivada);
  return entrada + '.' + base64url(assinatura);
}

async function obterTokenAcesso(){
  if(!credenciaisConfiguradas()) return null;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chavePrivada = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');
  const jwt = criarJWT(email, chavePrivada, 'https://www.googleapis.com/auth/drive.file');

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  const data = await resp.json().catch(() => ({}));
  if(!resp.ok){
    console.error('[Backup Drive] Erro ao autenticar com o Google:', JSON.stringify(data));
    return null;
  }
  return data.access_token;
}

// Envia um arquivo para a pasta configurada no Google Drive (upload multipart simples)
async function enviarArquivoParaDrive(nomeArquivo, bufferConteudo, tipoMime){
  const accessToken = await obterTokenAcesso();
  if(!accessToken) return { ok:false, erro:'Credenciais do Google não configuradas ou inválidas.' };

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const metadata = { name: nomeArquivo };
  if(folderId) metadata.parents = [folderId];

  const boundary = 'clinica_backup_' + Date.now();
  const delimitador = '\r\n--' + boundary + '\r\n';
  const fechamento = '\r\n--' + boundary + '--';
  const parteMetadata = delimitador + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata);
  const parteArquivo = delimitador + 'Content-Type: ' + tipoMime + '\r\n\r\n';
  const corpo = Buffer.concat([
    Buffer.from(parteMetadata, 'utf8'),
    Buffer.from(parteArquivo, 'utf8'),
    bufferConteudo,
    Buffer.from(fechamento, 'utf8')
  ]);

  try{
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body: corpo
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok){
      console.error('[Backup Drive] Erro ao enviar arquivo:', JSON.stringify(data));
      return { ok:false, erro: data };
    }
    return { ok:true, arquivo: data };
  }catch(e){
    console.error('[Backup Drive] Falha de rede ao enviar:', e.message);
    return { ok:false, erro: e.message };
  }
}

// Gera o backup completo (todas as clínicas) e envia pro Google Drive, compactado.
async function fazerBackupCompleto(){
  const backup = db.exportarTudo();
  const json = JSON.stringify(backup);
  const comprimido = zlib.gzipSync(Buffer.from(json, 'utf8'));

  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g,'-');
  const nomeArquivo = 'backup-clinica-' + carimbo + '.json.gz';

  const resultado = await enviarArquivoParaDrive(nomeArquivo, comprimido, 'application/gzip');
  if(resultado.ok){
    console.log('[Backup Drive] Backup enviado com sucesso: ' + nomeArquivo);
  }
  return resultado;
}

module.exports = { credenciaisConfiguradas, fazerBackupCompleto, enviarArquivoParaDrive };
