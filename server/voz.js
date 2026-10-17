// ============================================================
// ASSISTENTE DE VOZ — transcrição de áudio pelo servidor
// ------------------------------------------------------------
// O navegador grava o áudio e manda pra cá; o servidor repassa pra OpenAI
// (a chave NUNCA vai pro navegador), devolve só o TEXTO e descarta o áudio
// (nada é gravado em disco). Também mede os minutos usados por clínica, por
// mês, e bloqueia quando passa do limite — protege quem paga a conta.
//
// Variáveis de ambiente:
//   OPENAI_API_KEY             chave da OpenAI (obrigatória pra voz funcionar)
//   OPENAI_MODELO_TRANSCRICAO  modelo (padrão: gpt-transcribe)
//   VOZ_MINUTOS_MES            limite mensal por clínica, em minutos (padrão: 600)
//   OPENAI_BASE_URL            só pra testes (padrão: https://api.openai.com)
// Sem dependências externas: só módulos nativos do Node.
// ============================================================
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('./db');

const CHAVE_USO = 'sistema_uso_voz_v1'; // { "<clinicaId>": { "AAAA-MM": { segundos, chamadas } } }
const LIMITE_BYTES_AUDIO = 8 * 1024 * 1024;   // 8 MB por gravação
const DURACAO_MAX_SEG = 120;                  // 2 minutos por gravação
const PEDIDOS_POR_MINUTO = 12;                // por usuário
const TIMEOUT_MS = 45000;

// Termos que ajudam o modelo a acertar o vocabulário da odontologia.
const CONTEXTO_ODONTO = 'Ditado em português do Brasil durante o preenchimento de um odontograma. '
  + 'Vocabulário: dente 11 a 48, dente de leite 51 a 85, problema, tratado, ausente, sem alteração, cárie, '
  + 'restauração em resina, tratamento de canal, endodontia, extração, coroa, faceta, implante, prótese, '
  + 'profilaxia, limpeza, clareamento, raspagem, gengivite, periodontite, incisivo, canino, pré-molar, molar, siso, '
  + 'mil e oitocentos reais, trezentos e cinquenta reais.';

function configurada(){ return !!(process.env.OPENAI_API_KEY || '').trim(); }
function modelo(){ return (process.env.OPENAI_MODELO_TRANSCRICAO || '').trim() || 'gpt-transcribe'; }
function modeloNovo(){ return /^gpt-transcribe/.test(modelo()); }   // gpt-transcribe usa "languages" (plural) e "keywords"

// Palavras que o modelo novo deve reconhecer literalmente (cada uma numa linha só, sem < > nem quebras).
const PALAVRAS_CHAVE = ['odontograma', 'dente', 'cárie', 'restauração em resina', 'tratamento de canal', 'endodontia', 'extração',
  'coroa', 'faceta', 'implante', 'prótese', 'profilaxia', 'clareamento', 'raspagem', 'gengivite', 'periodontite', 'siso', 'ausente', 'tratado', 'problema'];
let dicasRecusadas = false;   // vira true se a OpenAI recusar languages/keywords; aí o servidor passa a enviar só o essencial
function limiteMinutos(){ const n = parseFloat(process.env.VOZ_MINUTOS_MES); return (isFinite(n) && n > 0) ? n : 600; }
function mesAtual(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

function usoDaClinica(clinicaId, mes){
  const todos = db.readStorage(CHAVE_USO) || {};
  const m = ((todos[clinicaId] || {})[mes || mesAtual()]) || { segundos: 0, chamadas: 0 };
  return { segundos: m.segundos || 0, chamadas: m.chamadas || 0, minutos: (m.segundos || 0) / 60, limiteMinutos: limiteMinutos() };
}
function somarUso(clinicaId, segundos){
  const todos = db.readStorage(CHAVE_USO) || {};
  const mes = mesAtual();
  if(!todos[clinicaId]) todos[clinicaId] = {};
  const m = todos[clinicaId][mes] || { segundos: 0, chamadas: 0 };
  m.segundos += segundos; m.chamadas += 1;
  todos[clinicaId][mes] = m;
  db.writeStorage(CHAVE_USO, todos);
}
function usoDeTodas(){
  const todos = db.readStorage(CHAVE_USO) || {};
  const mes = mesAtual();
  return Object.keys(todos).map(id => ({ clinicaId: id, minutos: ((todos[id][mes] || {}).segundos || 0) / 60, chamadas: (todos[id][mes] || {}).chamadas || 0 }));
}

// limite de pedidos por usuário (em memória)
const janelas = new Map();
function dentroDaTaxa(chave){
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter(t => agora - t < 60000);
  if(lista.length >= PEDIDOS_POR_MINUTO){ janelas.set(chave, lista); return false; }
  lista.push(agora); janelas.set(chave, lista); return true;
}

function extensaoDoMime(mime){
  const m = String(mime || '').toLowerCase();
  if(m.includes('webm')) return 'webm';
  if(m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4';
  if(m.includes('ogg') || m.includes('opus')) return 'ogg';
  if(m.includes('wav')) return 'wav';
  if(m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return null;
}

function montarMultipart(campos, arquivo){   // campos: lista de [nome, valor] (o mesmo nome pode se repetir)
  const limite = '----zelo' + crypto.randomBytes(12).toString('hex');
  const partes = [];
  campos.forEach(([k, v]) => {
    partes.push(Buffer.from('--' + limite + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n', 'utf8'));
  });
  partes.push(Buffer.from('--' + limite + '\r\nContent-Disposition: form-data; name="file"; filename="' + arquivo.nome + '"\r\nContent-Type: ' + arquivo.tipo + '\r\n\r\n', 'utf8'));
  partes.push(arquivo.dados);
  partes.push(Buffer.from('\r\n--' + limite + '--\r\n', 'utf8'));
  return { tipo: 'multipart/form-data; boundary=' + limite, corpo: Buffer.concat(partes) };
}

// nivel 0 = com dicas (idioma + palavras-chave); nivel 1 = só o essencial (modelo + contexto)
function camposDoPedido(nivel){
  if(modeloNovo()){
    const c = [['model', modelo()], ['response_format', 'json'], ['prompt', CONTEXTO_ODONTO]];
    if(nivel === 0){ c.push(['languages[]', 'pt']); PALAVRAS_CHAVE.forEach(k => c.push(['keywords[]', k])); }
    return c;
  }
  return [['model', modelo()], ['language', 'pt'], ['response_format', 'json'], ['prompt', CONTEXTO_ODONTO]];   // modelos antigos (gpt-4o-*)
}

function chamarOpenAI(audio, tipoArquivo, extensao, nivel){
  return new Promise((resolve, reject) => {
    const base = new URL((process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '') + '/v1/audio/transcriptions');
    const mp = montarMultipart(camposDoPedido(nivel),
      { nome: 'gravacao.' + extensao, tipo: tipoArquivo, dados: audio });
    const lib = base.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'POST', hostname: base.hostname, port: base.port || (base.protocol === 'http:' ? 80 : 443), path: base.pathname,
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY.trim(), 'Content-Type': mp.tipo, 'Content-Length': mp.corpo.length },
      timeout: TIMEOUT_MS
    }, (resp) => {
      const pedacos = [];
      resp.on('data', c => pedacos.push(c));
      resp.on('end', () => {
        const texto = Buffer.concat(pedacos).toString('utf8');
        let json = null; try{ json = JSON.parse(texto); }catch(e){ /* resposta não-JSON */ }
        if(resp.statusCode >= 200 && resp.statusCode < 300 && json && typeof json.text === 'string') return resolve(json.text);
        const err = new Error('openai_' + resp.statusCode); err.status = resp.statusCode; reject(err);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('tempo_esgotado')); });
    req.on('error', reject);
    req.write(mp.corpo); req.end();
  });
}

// Retorna { status, corpo } pronto pra enviar ao navegador. Nunca devolve a chave nem guarda o áudio.
async function transcrever({ clinicaId, usuarioId, audioBase64, mime, duracao }){
  if(!configurada()) return { status: 503, corpo: { erro: 'A transcrição por voz ainda não foi ativada neste sistema. Fale com o suporte.', codigo: 'voz_nao_configurada' } };
  if(!dentroDaTaxa(String(usuarioId))) return { status: 429, corpo: { erro: 'Muitos pedidos seguidos. Espere alguns segundos e tente de novo.', codigo: 'muitos_pedidos' } };
  const extensao = extensaoDoMime(mime);
  if(!extensao) return { status: 400, corpo: { erro: 'Formato de áudio não suportado neste aparelho.', codigo: 'formato_invalido' } };
  if(typeof audioBase64 !== 'string' || !audioBase64) return { status: 400, corpo: { erro: 'Nenhum áudio recebido.', codigo: 'audio_vazio' } };
  const audio = Buffer.from(audioBase64, 'base64');
  if(audio.length < 800) return { status: 400, corpo: { erro: 'A gravação ficou muito curta. Tente de novo.', codigo: 'audio_vazio' } };
  if(audio.length > LIMITE_BYTES_AUDIO) return { status: 413, corpo: { erro: 'A gravação ficou longa demais. Grave frases mais curtas.', codigo: 'audio_grande' } };
  let seg = parseFloat(duracao); if(!isFinite(seg)) seg = Math.max(1, audio.length / 12000);
  seg = Math.min(DURACAO_MAX_SEG, Math.max(1, seg));
  const antes = usoDaClinica(clinicaId);
  if(antes.minutos + seg / 60 > antes.limiteMinutos){
    return { status: 429, corpo: { erro: 'O limite de minutos de voz deste mês foi atingido. Você pode digitar na caixa de texto.', codigo: 'limite_mensal', uso: { minutos: antes.minutos, limiteMinutos: antes.limiteMinutos } } };
  }
  let texto;
  try{
    const tipoArq = String(mime).split(';')[0] || 'audio/webm';
    const niveis = (modeloNovo() && !dicasRecusadas) ? [0, 1] : [1];
    let ultimo = null; texto = null;
    for(const nivel of niveis){
      try{
        texto = await chamarOpenAI(audio, tipoArq, extensao, modeloNovo() ? nivel : 0);
        if(nivel === 1 && niveis.length === 2){ dicasRecusadas = true; console.error('[voz] a OpenAI recusou languages/keywords; usando só o essencial daqui pra frente.'); }
        ultimo = null; break;
      }catch(e){ ultimo = e; if(!(e.status === 400 || e.status === 422)) break; }   // só tenta de novo se for pedido recusado
    }
    if(ultimo) throw ultimo;
  }catch(e){
    console.error('[voz] falha na transcrição:', e.message); // não registra o conteúdo do áudio nem da fala
    if(e.status === 401 || e.status === 403) return { status: 502, corpo: { erro: 'A chave do serviço de voz foi recusada. Avise o suporte.', codigo: 'chave_recusada' } };
    if(e.status === 429) return { status: 503, corpo: { erro: 'O serviço de voz está ocupado ou sem saldo. Tente em instantes.', codigo: 'servico_ocupado' } };
    return { status: 502, corpo: { erro: 'Não foi possível transcrever agora. Tente de novo ou digite.', codigo: 'falha_servico' } };
  }
  somarUso(clinicaId, seg);
  const depois = usoDaClinica(clinicaId);
  return { status: 200, corpo: { ok: true, texto: String(texto || '').trim().slice(0, 2000), uso: { minutos: depois.minutos, limiteMinutos: depois.limiteMinutos } } };
}

function estado(clinicaId){
  const u = usoDaClinica(clinicaId);
  return { configurada: configurada(), minutosUsados: u.minutos, limiteMinutos: u.limiteMinutos, modelo: modelo() };
}

module.exports = { transcrever, estado, usoDeTodas, configurada, mesAtual };
