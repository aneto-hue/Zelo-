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
// O índice de fichas guarda uma entrada por paciente no formato { pacienteId, criadoEm, atualizadoEm }
// (e, em dados muito antigos, só o id em texto) — estes dois ajudantes cobrem os dois formatos.
function _entradaDoIndice(indice, pacienteId){
  return Array.isArray(indice) ? (indice.find(f => f === pacienteId || (f && f.pacienteId === pacienteId)) || null) : null;
}
function _semEntradaDoPaciente(indice, pacienteId){
  return (indice||[]).filter(f => !(f === pacienteId || (f && f.pacienteId === pacienteId)));
}

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
    entradaIndiceAnamnese: _entradaDoIndice(indiceAnamnese, pacienteId),
    estavaNoIndiceAnamnese: !!_entradaDoIndice(indiceAnamnese, pacienteId),
    fichaProntuario: fichaProntuario || null,
    entradaIndiceProntuario: _entradaDoIndice(indiceProntuario, pacienteId),
    estavaNoIndiceProntuario: !!_entradaDoIndice(indiceProntuario, pacienteId),
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
    await ClinicaStorage.save('ficha_anamnese_indice_v1', _semEntradaDoPaciente(indice, pacienteId));
  }
  if(dados.fichaProntuario) await ClinicaStorage.save('ficha_prontuario_paciente_' + pacienteId, null);
  if(dados.estavaNoIndiceProntuario){
    const indice = await ClinicaStorage.load('ficha_prontuario_indice_v1') || [];
    await ClinicaStorage.save('ficha_prontuario_indice_v1', _semEntradaDoPaciente(indice, pacienteId));
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

// Desfaz uma exclusão: pega o retrato guardado na lixeira e devolve tudo pro lugar. Lida com
// tipos diferentes de registro — hoje: 'paciente_completo' (cadastro + ficha + financeiro +
// agenda) e 'lancamentos_duplicados' (lançamentos removidos por serem cópias repetidas).
async function clinicaRestaurarDaLixeira(registroLixeiraId){
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  const registro = lixeiraAtual.find(r => r.id === registroLixeiraId);
  if(!registro) throw new Error('Registro não encontrado na lixeira (pode já ter sido restaurado).');

  if(registro.tipo === 'lancamentos_duplicados'){
    const lancamentosRemovidos = (registro.snapshot && registro.snapshot.lancamentosRemovidos) || [];
    if(lancamentosRemovidos.length){
      const dadosFin = await ClinicaStorage.load('controle_pagamentos_comissoes_v1') || { lancamentos:[], profissionais:[], rateiosFixos:[] };
      if(!Array.isArray(dadosFin.lancamentos)) dadosFin.lancamentos = [];
      lancamentosRemovidos.forEach(l => { if(!dadosFin.lancamentos.some(x=>x.id===l.id)) dadosFin.lancamentos.unshift(l); });
      await ClinicaStorage.save('controle_pagamentos_comissoes_v1', dadosFin);
    }
    const lixeiraAtualizada = lixeiraAtual.filter(r => r.id !== registroLixeiraId);
    await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtualizada);
    return;
  }

  if(registro.tipo === 'contrato_para_orcamento'){
    const snap = registro.snapshot || {};
    const lanc = snap.lancamento;
    if(!lanc) throw new Error('Esse registro não tem os dados do contrato.');
    const chaveFicha = snap.pacienteId ? ('ficha_anamnese_paciente_' + snap.pacienteId) : null;
    const ficha = chaveFicha ? await ClinicaStorage.load(chaveFicha) : null;
    // Segurança: se depois disso o paciente já teve OUTRO contrato lançado, restaurar este
    // duplicaria a cobrança — melhor avisar e não fazer nada.
    if(ficha && ficha.financeiroLancamentoId && ficha.financeiroLancamentoId !== lanc.id){
      throw new Error('Esse paciente já tem outro contrato lançado depois deste. Desfaça o contrato novo antes de restaurar este, pra não duplicar a cobrança.');
    }
    const dadosFin = await ClinicaStorage.load('controle_pagamentos_comissoes_v1') || { lancamentos:[], profissionais:[], rateiosFixos:[] };
    if(!Array.isArray(dadosFin.lancamentos)) dadosFin.lancamentos = [];
    if(!dadosFin.lancamentos.some(x => x.id === lanc.id)) dadosFin.lancamentos.unshift(lanc);
    await ClinicaStorage.save('controle_pagamentos_comissoes_v1', dadosFin);
    if(ficha){
      ficha.financeiroLancamentoId = lanc.id;
      if(ficha.contract && snap.dataContratoAnterior) ficha.contract.dataContrato = snap.dataContratoAnterior;
      if(snap.orcamentoRegistradoId && Array.isArray(ficha.historicoOrcamentos)){
        ficha.historicoOrcamentos = ficha.historicoOrcamentos.filter(o => o.id !== snap.orcamentoRegistradoId);
      }
      await ClinicaStorage.save(chaveFicha, ficha);
    }
    await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtual.filter(r => r.id !== registroLixeiraId));
    return;
  }

  // Paciente excluído por completo: restaura todas as partes que ainda estão pendentes
  // (veja clinicaRestaurarPartesDaLixeira, que também permite restaurar só algumas, como o cadastro).
  return clinicaRestaurarPartesDaLixeira(registroLixeiraId);
}

// ---- Restaurar um paciente excluído por PARTES ----
// O que foi guardado na Lixeira de um paciente: cadastro, ficha de anamnese, ficha de prontuário,
// lançamentos do Financeiro e consultas da agenda. Dá pra restaurar tudo de uma vez ou só o
// cadastro (e o resto depois). O registro vai marcando o que já voltou; só sai da Lixeira
// quando não sobra mais nada pendente.
function lixeiraPartesDoRegistro(registro){
  const snap = registro.snapshot || {};
  const feitas = registro.restaurado || {};
  const nFin = (snap.lancamentosFinanceiro||[]).length;
  const nAg = (snap.consultasAgendamento||[]).length;
  const todas = [];
  if(snap.paciente) todas.push({ id:'cadastro', rotulo:'cadastro do paciente' });
  if(snap.fichaAnamnese) todas.push({ id:'anamnese', rotulo:'ficha de anamnese' });
  if(snap.fichaProntuario) todas.push({ id:'prontuario', rotulo:'ficha de prontuário' });
  if(nFin) todas.push({ id:'financeiro', rotulo: nFin+' lançamento(s) do Financeiro' });
  if(nAg) todas.push({ id:'agenda', rotulo: nAg+' consulta(s) da agenda' });
  return {
    pendentes: todas.filter(p => !feitas[p.id]),
    restauradas: todas.filter(p => feitas[p.id]),
  };
}

// partesPedidas: lista de ids ('cadastro', 'anamnese', 'prontuario', 'financeiro', 'agenda') ou
// nada, pra restaurar tudo que falta. Devolve { restauradas, puladas, avisos, removido }:
//  - puladas: partes que NÃO foram restauradas por segurança (continuam na Lixeira)
//  - avisos: observações que não são erro (ex: o cadastro já estava na lista)
async function clinicaRestaurarPartesDaLixeira(registroLixeiraId, partesPedidas){
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  const registro = lixeiraAtual.find(r => r.id === registroLixeiraId);
  if(!registro) throw new Error('Registro não encontrado na lixeira (pode já ter sido restaurado).');
  if(registro.tipo !== 'paciente_completo') throw new Error('Esse tipo de registro não tem partes separadas.');
  const snap = registro.snapshot || {};
  const pacienteId = registro.pacienteId;
  if(!registro.restaurado) registro.restaurado = {};

  const alvo = lixeiraPartesDoRegistro(registro).pendentes.filter(p => !partesPedidas || partesPedidas.includes(p.id));
  const restauradas = [], puladas = [], avisos = [];

  async function restaurarFicha(parte, chave, dadosFicha, chaveIndice, estavaNoIndice){
    // Nunca sobrescreve uma ficha que já exista hoje: pode ser uma ficha NOVA, criada depois da
    // exclusão, e substituir faria a pessoa perder o que foi preenchido.
    const atual = await ClinicaStorage.load(chave);
    if(atual){
      puladas.push({ id: parte.id, rotulo: parte.rotulo, motivo:'já existe uma ficha atual desse paciente e ela não foi substituída. Se quiser a antiga de volta, limpe a atual ("Iniciar nova ficha") e restaure de novo.' });
      return;
    }
    await ClinicaStorage.save(chave, dadosFicha);
    if(estavaNoIndice){
      const indice = await ClinicaStorage.load(chaveIndice) || [];
      if(!_entradaDoIndice(indice, pacienteId)){
        // devolve a entrada original; em itens antigos da Lixeira (só um "sim"), cria uma nova
        indice.push(typeof estavaNoIndice === 'object' ? estavaNoIndice : { pacienteId, criadoEm: Date.now(), atualizadoEm: Date.now() });
        await ClinicaStorage.save(chaveIndice, indice);
      }
    }
    registro.restaurado[parte.id] = true; restauradas.push(parte.rotulo);
  }

  for(const parte of alvo){
    if(parte.id === 'cadastro'){
      await clinicaInitPacientes(); // lê a lista mais recente antes de mexer, pra não apagar mudanças de outra pessoa
      if(clinicaFindPacienteById(snap.paciente.id)){
        avisos.push('O cadastro de "'+snap.paciente.nome+'" já estava na lista de pacientes.');
      } else {
        _clinicaPacientesCache = _clinicaPacientesCache.concat([snap.paciente]);
        await ClinicaStorage.save(CLINICA_PACIENTES_KEY, _clinicaPacientesCache);
        restauradas.push(parte.rotulo);
      }
      registro.restaurado.cadastro = true;
    } else if(parte.id === 'anamnese'){
      await restaurarFicha(parte, 'ficha_anamnese_paciente_' + pacienteId, snap.fichaAnamnese, 'ficha_anamnese_indice_v1', snap.entradaIndiceAnamnese || snap.estavaNoIndiceAnamnese);
    } else if(parte.id === 'prontuario'){
      await restaurarFicha(parte, 'ficha_prontuario_paciente_' + pacienteId, snap.fichaProntuario, 'ficha_prontuario_indice_v1', snap.entradaIndiceProntuario || snap.estavaNoIndiceProntuario);
    } else if(parte.id === 'financeiro'){
      const dadosFin = await ClinicaStorage.load('controle_pagamentos_comissoes_v1') || { lancamentos:[], profissionais:[], rateiosFixos:[] };
      if(!Array.isArray(dadosFin.lancamentos)) dadosFin.lancamentos = [];
      snap.lancamentosFinanceiro.forEach(l => { if(!dadosFin.lancamentos.some(x=>x.id===l.id)) dadosFin.lancamentos.unshift(l); });
      await ClinicaStorage.save('controle_pagamentos_comissoes_v1', dadosFin);
      registro.restaurado.financeiro = true; restauradas.push(parte.rotulo);
    } else if(parte.id === 'agenda'){
      const dadosAgenda = await ClinicaStorage.load('controle_agendamento_progresso_v1') || { consultas:[], profissionais:[], bloqueios:[] };
      if(!Array.isArray(dadosAgenda.consultas)) dadosAgenda.consultas = [];
      snap.consultasAgendamento.forEach(c => { if(!dadosAgenda.consultas.some(x=>x.id===c.id)) dadosAgenda.consultas.unshift(c); });
      await ClinicaStorage.save('controle_agendamento_progresso_v1', dadosAgenda);
      registro.restaurado.agenda = true; restauradas.push(parte.rotulo);
    }
  }

  // O registro só sai da Lixeira quando não sobra nenhuma parte pendente; senão continua lá,
  // marcando o que já voltou.
  const removido = lixeiraPartesDoRegistro(registro).pendentes.length === 0;
  const lixeiraNova = removido ? lixeiraAtual.filter(r => r.id !== registroLixeiraId) : lixeiraAtual;
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraNova);
  return { restauradas, puladas, avisos, removido };
}

// Apaga um registro da lixeira PRA SEMPRE (sem possibilidade de restaurar depois) — usado
// quando o gestor tem certeza de que não vai precisar mais daqueles dados.
async function clinicaExcluirDefinitivamenteDaLixeira(registroLixeiraId){
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtual.filter(r => r.id !== registroLixeiraId));
}

// Versão genérica da lixeira, pra outros tipos de exclusão além de "paciente completo" (por
// exemplo, lançamentos duplicados removidos no Financeiro). O "snapshot" pode ser qualquer
// coisa — quem for restaurar precisa saber como interpretar aquele tipo específico.
async function clinicaAdicionarNaLixeiraGenerico(tipo, descricaoCurta, motivo, snapshot, resumo){
  const registro = {
    id: lixeiraUid(), tipo, pacienteNome: descricaoCurta,
    quem: (window._clinicaMe && window._clinicaMe.nome) || 'Usuário',
    quando: Date.now(), motivo, resumo: resumo || descricaoCurta, snapshot,
  };
  const lixeiraAtual = await ClinicaStorage.load(LIXEIRA_KEY) || [];
  lixeiraAtual.unshift(registro);
  await ClinicaStorage.save(LIXEIRA_KEY, lixeiraAtual);
  return registro.id;
}

// ============================================================
// CONTRATO FECHADO POR ENGANO -> VOLTA A SER SÓ ORÇAMENTO
// Tira um contrato da contabilidade (Financeiro) e devolve a ficha do paciente ao estado de
// orçamento: a ficha deixa de constar como "concluída/enviada ao Financeiro" (libera o botão
// "Concluir contrato" de novo) e a data do contrato é limpa (senão os alertas de retorno
// achariam que o procedimento foi realmente feito). Tudo que existia fica guardado na Lixeira,
// com o motivo, e dá pra restaurar.
//
// NÃO mexe na lista de lançamentos do Financeiro — quem chama é que remove o lançamento, cada
// um do seu jeito (o Financeiro mantém a lista em memória e a salva inteira; a Anamnese edita
// direto o que está salvo). Opções:
//   registrarOrcamento        -> também cria um registro de orçamento em aberto no histórico da
//                                ficha (aparece em "Orçamentos abertos" na Central de Pendências)
//   atualizarFichaNoStorage   -> false quando a Anamnese está com a ficha aberta na tela (ela
//                                mesma atualiza e salva a própria ficha, senão o salvamento
//                                automático dela desfaria a mudança)
//   orcamentoJaRegistradoId / dataContratoAnterior -> usados quando a Anamnese já fez isso
function montarRetratoOrcamentoDoLancamento(lanc){
  const fmt = n => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const trats = (lanc.tratamentos && lanc.tratamentos.length) ? lanc.tratamentos : [{ descricao:'Tratamento', valor: lanc.valorTotal||0 }];
  const somaTrats = trats.reduce((a,t)=>a+(Number(t.valor)||0),0);
  return {
    id: 'orc' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
    dataGeracao: Date.now(),
    itens: [],
    outros: trats.map(t => ({ descricao: t.descricao||'', valor: fmt(t.valor) })),
    total: Number(lanc.valorTotal) > 0 ? Number(lanc.valorTotal) : somaTrats,
  };
}

async function clinicaReverterContratoParaOrcamento(lanc, motivo, opcoes){
  opcoes = opcoes || {};
  if(!lanc) throw new Error('Lançamento não encontrado.');
  if(!(motivo||'').trim()) throw new Error('É obrigatório informar o motivo.');

  let orcamentoRegistradoId = opcoes.orcamentoJaRegistradoId || null;
  let dataContratoAnterior = opcoes.dataContratoAnterior || '';

  if(opcoes.atualizarFichaNoStorage !== false && lanc.pacienteId){
    const chave = 'ficha_anamnese_paciente_' + lanc.pacienteId;
    const ficha = await ClinicaStorage.load(chave);
    if(ficha){
      ficha.financeiroLancamentoId = '';
      if(ficha.contract){ dataContratoAnterior = ficha.contract.dataContrato || ''; ficha.contract.dataContrato = ''; }
      if(opcoes.registrarOrcamento){
        const entrada = montarRetratoOrcamentoDoLancamento(lanc);
        if(!Array.isArray(ficha.historicoOrcamentos)) ficha.historicoOrcamentos = [];
        ficha.historicoOrcamentos.unshift(entrada);
        orcamentoRegistradoId = entrada.id;
      }
      await ClinicaStorage.save(chave, ficha);
    }
  }

  const todasParcelas = (lanc.parcelas||[]).concat(...(lanc.linhasDerivadas||[]).map(ld => ld.parcelas||[]));
  const pagas = todasParcelas.filter(p => p.pago).length;
  const resumo = 'Contrato de R$ ' + (Number(lanc.valorTotal)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) +
    ' tirado da contabilidade e devolvido ao estado de orçamento (' + todasParcelas.length + ' parcela(s), ' + pagas + ' já paga(s))';
  await clinicaAdicionarNaLixeiraGenerico('contrato_para_orcamento', lanc.paciente || '(sem nome)', motivo.trim(),
    { lancamento: lanc, pacienteId: lanc.pacienteId || '', orcamentoRegistradoId, dataContratoAnterior }, resumo);
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
