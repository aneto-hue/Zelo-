// ============================================================
// "BANCO DE DADOS" EM ARQUIVOS JSON
// ------------------------------------------------------------
// Sem dependências externas de propósito: evita problemas de
// instalação em qualquer hospedagem. Cada "tabela" é um arquivo
// .json dentro da pasta dados/, guardando uma lista de registros.
// Para uma clínica pequena/média, isso é suficiente e muito mais
// simples de manter e fazer backup (é só copiar a pasta "dados/").
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'dados');
const TABLES_DIR = path.join(DATA_DIR, 'tabelas');
const STORAGE_DIR = path.join(DATA_DIR, 'storage');

[DATA_DIR, TABLES_DIR, STORAGE_DIR].forEach(dir => {
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function chaveValida(key){
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

// ---------- Tabelas (listas de registros: profissionais, pacientes, sessões, tokens) ----------
function readTable(nome){
  if(!chaveValida(nome)) throw new Error('Nome de tabela inválido: ' + nome);
  const filePath = path.join(TABLES_DIR, nome + '.json');
  try{
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  }catch(e){
    return [];
  }
}

function writeTable(nome, lista){
  if(!chaveValida(nome)) throw new Error('Nome de tabela inválido: ' + nome);
  const filePath = path.join(TABLES_DIR, nome + '.json');
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(lista));
  fs.renameSync(tmpPath, filePath); // grava de forma atômica (evita arquivo corrompido se cair no meio)
}

// ---------- Armazenamento genérico chave/valor (usado pelos módulos: fichas, agenda, estoque, financeiro) ----------
function readStorage(key){
  if(!chaveValida(key)) throw new Error('Chave inválida: ' + key);
  const filePath = path.join(STORAGE_DIR, key + '.json');
  try{
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}

function writeStorage(key, value){
  if(!chaveValida(key)) throw new Error('Chave inválida: ' + key);
  const filePath = path.join(STORAGE_DIR, key + '.json');
  if(value === null || value === undefined){
    try{ fs.unlinkSync(filePath); }catch(e){}
    return;
  }
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(value));
  fs.renameSync(tmpPath, filePath);
}

function listStorageKeysWithPrefix(prefix){
  return fs.readdirSync(STORAGE_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith(prefix))
    .map(f => f.slice(0, -('.json'.length)));
}

// ---------- Exportação/restauração completa (usado pelo backup) ----------
function exportarTudo(){
  const tabelas = {};
  fs.readdirSync(TABLES_DIR).forEach(f => {
    if(f.endsWith('.json') && !f.endsWith('.tmp')){
      const nome = f.slice(0, -5);
      if(chaveValida(nome)) tabelas[nome] = readTable(nome);
    }
  });
  const storage = {};
  fs.readdirSync(STORAGE_DIR).forEach(f => {
    if(f.endsWith('.json') && !f.endsWith('.tmp')){
      const nome = f.slice(0, -5);
      if(chaveValida(nome)) storage[nome] = readStorage(nome);
    }
  });
  return { criadoEm: Date.now(), versao: 1, tabelas, storage };
}

// Restaura um backup gerado por exportarTudo(). SOBRESCREVE os dados atuais — use com cuidado.
function restaurarTudo(backup){
  if(!backup || typeof backup !== 'object') throw new Error('Backup inválido.');
  const tabelas = backup.tabelas || {};
  const storage = backup.storage || {};
  Object.keys(tabelas).forEach(nome => { if(chaveValida(nome)) writeTable(nome, tabelas[nome]); });
  Object.keys(storage).forEach(nome => { if(chaveValida(nome)) writeStorage(nome, storage[nome]); });
  return { tabelasRestauradas: Object.keys(tabelas).length, chavesRestauradas: Object.keys(storage).length };
}

module.exports = { readTable, writeTable, readStorage, writeStorage, listStorageKeysWithPrefix, exportarTudo, restaurarTudo, DATA_DIR };
