// ============================================================
// CADASTRO COMPARTILHADO DE PACIENTES
// Usado por: Ficha de Anamnese, Prontuário, Agendamento e Financeiro.
// Agora guardado através do servidor local (server.js) quando disponível,
// para que todos os aparelhos da rede vejam o mesmo cadastro.
// Requer que client-storage.js seja incluído ANTES deste arquivo.
// ============================================================
const CLINICA_PACIENTES_KEY = 'clinica_pacientes_registro_v1';

let _clinicaPacientesCache = [];

// Carrega o cadastro (do servidor, ou do navegador se o servidor não estiver disponível).
// Deve ser chamado (com await) uma vez, antes da primeira renderização de cada módulo.
async function clinicaInitPacientes(){
  const data = await ClinicaStorage.load(CLINICA_PACIENTES_KEY);
  _clinicaPacientesCache = Array.isArray(data) ? data : [];
  return _clinicaPacientesCache;
}

function clinicaUid(){ return 'pac'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// Leitura síncrona (usa o que já foi carregado por clinicaInitPacientes)
function clinicaGetPacientes(){
  return _clinicaPacientesCache;
}

function clinicaSalvarCache(){
  ClinicaStorage.save(CLINICA_PACIENTES_KEY, _clinicaPacientesCache);
}

function clinicaNormalizaNome(nome){
  return String(nome||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function clinicaFindPacienteByNome(nome){
  if(!nome) return null;
  const alvo = clinicaNormalizaNome(nome);
  if(!alvo) return null;
  return _clinicaPacientesCache.find(p => clinicaNormalizaNome(p.nome) === alvo) || null;
}
function clinicaFindPacienteById(id){
  if(!id) return null;
  return _clinicaPacientesCache.find(p => p.id === id) || null;
}

// Cria ou atualiza um paciente no cadastro compartilhado a partir de um objeto parcial de dados.
// Casa por nome (ou por id, se fornecido). Nunca apaga um dado já preenchido com um valor vazio novo.
function clinicaUpsertPaciente(dados){
  if(!dados || !(dados.nome||'').trim()) return null;
  let existente = dados.id ? _clinicaPacientesCache.find(p=>p.id===dados.id) : null;
  if(!existente) existente = _clinicaPacientesCache.find(p => clinicaNormalizaNome(p.nome) === clinicaNormalizaNome(dados.nome));

  if(existente){
    Object.keys(dados).forEach(k=>{
      if(k==='id') return;
      const val = dados[k];
      if(val !== undefined && val !== null && String(val).trim() !== ''){
        existente[k] = val;
      }
    });
    existente.atualizadoEm = new Date().toISOString();
  } else {
    existente = Object.assign({
      id: clinicaUid(), nome:'', nasc:'', sexo:'', telefone:'', cpf:'', rg:'', endereco:'', email:'',
      criadoEm: new Date().toISOString()
    }, dados);
    _clinicaPacientesCache.push(existente);
  }
  clinicaSalvarCache();
  return existente;
}

function clinicaRemovePaciente(id){
  _clinicaPacientesCache = _clinicaPacientesCache.filter(p=>p.id!==id);
  clinicaSalvarCache();
}

// Preenche um <input> de texto com sugestões de nomes já cadastrados (via <datalist>),
// para os módulos que só precisam digitar/selecionar um nome (Agendamento, Financeiro).
function clinicaPacientesDatalistId(){
  return 'clinica-pacientes-datalist';
}
function clinicaGarantirDatalist(){
  let dl = document.getElementById(clinicaPacientesDatalistId());
  if(!dl){
    dl = document.createElement('datalist');
    dl.id = clinicaPacientesDatalistId();
    document.body.appendChild(dl);
  }
  dl.innerHTML = '';
  _clinicaPacientesCache.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.nome;
    dl.appendChild(opt);
  });
  return dl.id;
}
