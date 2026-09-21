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
// IMPORTANTE: busca a versão mais recente do cadastro no servidor antes de decidir — isso evita
// criar duplicado quando duas pessoas, em aparelhos diferentes, mexem no mesmo paciente quase ao
// mesmo tempo (cada aparelho tendo uma cópia local que podia estar um pouco desatualizada).
async function clinicaUpsertPaciente(dados){
  if(!dados || !(dados.nome||'').trim()) return null;
  try{
    const maisRecente = await ClinicaStorage.load(CLINICA_PACIENTES_KEY);
    if(Array.isArray(maisRecente)) _clinicaPacientesCache = maisRecente;
  }catch(e){ /* segue com o que já tinha em memória, melhor que travar */ }

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
  await ClinicaStorage.save(CLINICA_PACIENTES_KEY, _clinicaPacientesCache);
  return existente;
}

function clinicaRemovePaciente(id){
  _clinicaPacientesCache = _clinicaPacientesCache.filter(p=>p.id!==id);
  clinicaSalvarCache();
}

// ============================================================
// LIXEIRA — exclusão completa de um paciente (cadastro + ficha de anamnese + ficha de
// prontuário + lançamentos no Financeiro + consultas na Agenda), com motivo obrigatório e
// possibilidade de restaurar tudo depois. Em vez de apagar de vez, guarda um "retrato" de tudo
// que existia antes de excluir, na lista compartilhada 'lixeira_clinica_v1'.
const LIXEIRA_KEY = 'lixeira_clinica_v1';

function lixeiraUid(){ return 'lix'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// Reúne tudo que existe hoje sobre um paciente, em todos os módulos, sem apagar nada ainda —
// usado tanto pra montar o retrato antes de excluir quanto pra mostrar ao gestor, na hora de
// confirmar, exatamente o que vai ser apagado (quantas fichas, lançamentos, consultas).
async function coletarDadosCompletosDoPaciente(pacienteId){
  const [
    fichaAnamnese, indiceAnamnese,
    fichaProntuario, indiceProntuario,
    dadosFinanceiro, dadosAgendamento,
  ] = await Promise.all([
    ClinicaStorage.load('ficha_anamnese_paciente_' + pacienteId).catch(()=>null),
    ClinicaStorage.load('ficha_anamnese_indice_v1').catch(()=>null),
    ClinicaStorage.load('ficha_prontuario_paciente_' + pacienteId).catch(()=>null),
    ClinicaStorage.load('ficha_prontuario_indice_v1').catch(()=>null),
    ClinicaStorage.load('controle_pagamentos_comissoes_v1').catch(()=>null),
    ClinicaStorage.load('controle_agendamento_progresso_v1').catch(()=>null),
  ]);
  const lancamentosDoPaciente = ((dadosFinanceiro && dadosFinanceiro.lancamentos) || []).filter(l => l.pacienteId === pacienteId);
  const consultasDoPaciente = ((dadosAgendamento && dadosAgendamento.consultas) || []).filter(c => c.pacienteId === pacienteId);
  return {
    paciente: clinicaFindPacienteById(pacienteId),
    fichaAnamnese: fichaAnamnese || null,
    estavaNoIndiceAnamnese: Array.isArray(indiceAnamnese) ? indiceAnamnese.includes(pacienteId) : false,
    fichaProntuario: fichaProntuario || null,
    estavaNoIndiceProntuario: Array.isArray(indiceProntuario) ? indiceProntuario.includes(pacienteId) : false,
    lancamentosFinanceiro: lancamentosDoPaciente,
    consultasAgendamento: consultasDoPaciente,
  };
}

// Exclui de vez (das listas ativas) tudo sobre um paciente, guardando antes um retrato completo
// na lixeira — com quem excluiu, quando, e o motivo (obrigatório). Retorna o id do registro
// criado na lixeira, que pode ser usado depois pra restaurar tudo com clinicaRestaurarDaLixeira.
async function clinicaExcluirTudoDoPaciente(pacienteId, motivo){
  if(!(motivo||'').trim()) throw new Error('É obrigatório informar o motivo da exclusão.');
  const dados = await coletarDadosCompletosDoPaciente(pacienteId);
  if(!dados.paciente) throw new Error('Paciente não encontrado.');

  const registroLixeira = {
    id: lixeiraUid(),
    tipo: 'paciente_completo',
    pacienteId,
    pacienteNome: dados.paciente.nome,
    quem: (window._clinicaMe && window._clinicaMe.nome) || 'Usuário',
    quando: Date.now(),
    motivo: motivo.trim(),
    resumo: [
      dados.fichaAnamnese ? '1 ficha de anamnese' : null,
      dados.fichaProntuario ? '1 ficha de prontuário' : null,
      dados.lancamentosFinanceiro.length ? (dados.lancamentosFinanceiro.length+' lançamento(s) financeiro(s)') : null,
      dados.consultasAgendamento.length ? (dados.consultasAgendamento.length+' consulta(s) na agenda') : null,
    ].filter(Boolean).join(', ') || 'só o cadastro (sem ficha, financeiro ou consultas)',
    snapshot: dados,
  };

  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  lixeiraAtual.unshift(registroLixeira);
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtual);

  // Só depois de garantir que o retrato foi salvo na lixeira é que apaga de fato, das listas
  // ativas de cada módulo.
  clinicaRemovePaciente(pacienteId);
  if(dados.fichaAnamnese) await ClinicaStorage.save('ficha_anamnese_paciente_' + pacienteId, null);
  if(dados.estavaNoIndiceAnamnese){
    const indice = await ClinicaStorage.load('ficha_anamnese_indice_v1') || [];
    await ClinicaStorage.save('ficha_anamnese_indice_v1', indice.filter(id => id !== pacienteId));
  }
  if(dados.fichaProntuario) await ClinicaStorage.save('ficha_prontuario_paciente_' + pacienteId, null);
  if(dados.estavaNoIndiceProntuario){
    const indice = await ClinicaStorage.load('ficha_prontuario_indice_v1') || [];
    await ClinicaStorage.save('ficha_prontuario_indice_v1', indice.filter(id => id !== pacienteId));
  }
  if(dados.lancamentosFinanceiro.length){
    const dadosFin = await ClinicaStorage.load('controle_pagamentos_comissoes_v1');
    if(dadosFin && Array.isArray(dadosFin.lancamentos)){
      dadosFin.lancamentos = dadosFin.lancamentos.filter(l => l.pacienteId !== pacienteId);
      await ClinicaStorage.save('controle_pagamentos_comissoes_v1', dadosFin);
    }
  }
  if(dados.consultasAgendamento.length){
    const dadosAgenda = await ClinicaStorage.load('controle_agendamento_progresso_v1');
    if(dadosAgenda && Array.isArray(dadosAgenda.consultas)){
      dadosAgenda.consultas = dadosAgenda.consultas.filter(c => c.pacienteId !== pacienteId);
      await ClinicaStorage.save('controle_agendamento_progresso_v1', dadosAgenda);
    }
  }
  return registroLixeira.id;
}

// Desfaz uma exclusão: pega o retrato guardado na lixeira e devolve tudo pro lugar — cadastro,
// ficha de anamnese, ficha de prontuário, lançamentos financeiros e consultas da agenda.
async function clinicaRestaurarDaLixeira(registroLixeiraId){
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  const registro = lixeiraAtual.find(r => r.id === registroLixeiraId);
  if(!registro) throw new Error('Registro não encontrado na lixeira (pode já ter sido restaurado).');
  const dados = registro.snapshot;

  if(dados.paciente){
    _clinicaPacientesCache = _clinicaPacientesCache.filter(p => p.id !== dados.paciente.id);
    _clinicaPacientesCache.push(dados.paciente);
    await ClinicaStorage.save(CLINICA_PACIENTES_KEY, _clinicaPacientesCache);
  }
  if(dados.fichaAnamnese) await ClinicaStorage.save('ficha_anamnese_paciente_' + registro.pacienteId, dados.fichaAnamnese);
  if(dados.estavaNoIndiceAnamnese){
    const indice = await ClinicaStorage.load('ficha_anamnese_indice_v1') || [];
    if(!indice.includes(registro.pacienteId)){ indice.push(registro.pacienteId); await ClinicaStorage.save('ficha_anamnese_indice_v1', indice); }
  }
  if(dados.fichaProntuario) await ClinicaStorage.save('ficha_prontuario_paciente_' + registro.pacienteId, dados.fichaProntuario);
  if(dados.estavaNoIndiceProntuario){
    const indice = await ClinicaStorage.load('ficha_prontuario_indice_v1') || [];
    if(!indice.includes(registro.pacienteId)){ indice.push(registro.pacienteId); await ClinicaStorage.save('ficha_prontuario_indice_v1', indice); }
  }
  if((dados.lancamentosFinanceiro||[]).length){
    const dadosFin = await ClinicaStorage.load('controle_pagamentos_comissoes_v1') || { lancamentos:[], profissionais:[], rateiosFixos:[] };
    if(!Array.isArray(dadosFin.lancamentos)) dadosFin.lancamentos = [];
    dados.lancamentosFinanceiro.forEach(l => { if(!dadosFin.lancamentos.some(x=>x.id===l.id)) dadosFin.lancamentos.unshift(l); });
    await ClinicaStorage.save('controle_pagamentos_comissoes_v1', dadosFin);
  }
  if((dados.consultasAgendamento||[]).length){
    const dadosAgenda = await ClinicaStorage.load('controle_agendamento_progresso_v1') || { consultas:[], profissionais:[], bloqueios:[] };
    if(!Array.isArray(dadosAgenda.consultas)) dadosAgenda.consultas = [];
    dados.consultasAgendamento.forEach(c => { if(!dadosAgenda.consultas.some(x=>x.id===c.id)) dadosAgenda.consultas.unshift(c); });
    await ClinicaStorage.save('controle_agendamento_progresso_v1', dadosAgenda);
  }

  // Remove o registro da lixeira, já que foi restaurado.
  const lixeiraAtualizada = lixeiraAtual.filter(r => r.id !== registroLixeiraId);
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtualizada);
}

// Apaga um registro da lixeira PRA SEMPRE (sem possibilidade de restaurar depois) — usado
// quando o gestor tem certeza de que não vai precisar mais daqueles dados.
async function clinicaExcluirDefinitivamenteDaLixeira(registroLixeiraId){
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtual.filter(r => r.id !== registroLixeiraId));
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
