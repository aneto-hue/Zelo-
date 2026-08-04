// ============================================================
// LEMBRETE AUTOMÁTICO DE RETORNO
// ------------------------------------------------------------
// Roda periodicamente (uma vez por dia) e, para cada clínica que tiver
// essa opção ativada no Perfil da Clínica, verifica quais pacientes não
// têm uma consulta CONFIRMADA há X meses e dispara uma mensagem de
// WhatsApp (via 360dialog) chamando para retornar.
// ============================================================
const db = require('./db');
const whatsapp = require('./whatsapp');

function chaveEscopada(clinicaId, key){
  return 'clin' + clinicaId + '_' + key;
}

// Deixa o telefone só com dígitos, garantindo o DDI do Brasil (55) se faltar
function normalizarTelefone(tel){
  let digitos = String(tel||'').replace(/\D/g,'');
  if(!digitos) return null;
  if(digitos.length <= 11) digitos = '55' + digitos;
  return digitos;
}

function calcularMesesEntre(dataISO, hoje){
  const partes = String(dataISO||'').split('-').map(Number);
  if(partes.length !== 3 || partes.some(isNaN)) return -1;
  const [y,m,d] = partes;
  const dataAlvo = new Date(y, m-1, d);
  const diffMs = hoje - dataAlvo;
  return diffMs / (1000*60*60*24*30.44); // aproximação de meses (30,44 dias/mês em média)
}

async function verificarLembretesDaClinica(clinica, hoje){
  const chave = (sufixo) => chaveEscopada(clinica.id, sufixo);
  const perfil = db.readStorage(chave('clinica_perfil_v1'));
  if(!perfil || !perfil.lembreteRetornoAtivo) return { verificados: 0, enviados: 0 };

  const mesesLimite = parseFloat(perfil.lembreteRetornoMeses) || 6;
  const pacientes = db.readStorage(chave('clinica_pacientes_registro_v1')) || [];
  const dadosAgenda = db.readStorage(chave('controle_agendamento_progresso_v1')) || { consultas: [] };
  const jaEnviados = db.readStorage(chave('lembretes_enviados_v1')) || [];

  // Última consulta CONFIRMADA (que realmente aconteceu) de cada paciente
  const ultimaVisitaPorPaciente = {};
  (dadosAgenda.consultas || []).forEach(c => {
    if(c.status !== 'confirmado' || !c.pacienteId || !c.data) return;
    if(!ultimaVisitaPorPaciente[c.pacienteId] || c.data > ultimaVisitaPorPaciente[c.pacienteId]){
      ultimaVisitaPorPaciente[c.pacienteId] = c.data;
    }
  });

  let enviados = 0;
  let mudou = false;

  for(const paciente of pacientes){
    const ultimaData = ultimaVisitaPorPaciente[paciente.id];
    if(!ultimaData || !paciente.telefone) continue;

    const meses = calcularMesesEntre(ultimaData, hoje);
    if(meses < mesesLimite) continue;

    // Já mandamos lembrete pra essa MESMA última visita? Não manda de novo todo dia.
    const jaTemRegistro = jaEnviados.some(r => r.pacienteId === paciente.id && r.dataUltimaConsulta === ultimaData);
    if(jaTemRegistro) continue;

    const telefone = normalizarTelefone(paciente.telefone);
    if(!telefone) continue;

    const resultado = await whatsapp.enviarMensagemWhatsApp(telefone, [
      paciente.nome || 'Paciente',
      clinica.nome || perfil.nome || 'a clínica',
      perfil.telefone || ''
    ]);

    jaEnviados.push({
      pacienteId: paciente.id,
      dataUltimaConsulta: ultimaData,
      enviadoEm: Date.now(),
      sucesso: !!resultado.ok,
      simulado: !!resultado.simulado
    });
    mudou = true;
    enviados++;
  }

  if(mudou) db.writeStorage(chave('lembretes_enviados_v1'), jaEnviados);
  return { verificados: pacientes.length, enviados };
}

async function verificarLembretesTodasClinicas(){
  const clinicas = db.readTable('clinicas').filter(c => c.ativa !== false);
  const hoje = new Date();
  const resumo = [];
  for(const clinica of clinicas){
    try{
      const r = await verificarLembretesDaClinica(clinica, hoje);
      resumo.push({ clinica: clinica.nome, ...r });
    }catch(e){
      console.error('[Lembretes] Erro ao processar a clínica "' + clinica.nome + '":', e.message);
      resumo.push({ clinica: clinica.nome, erro: e.message });
    }
  }
  const totalEnviados = resumo.reduce((s,r) => s + (r.enviados||0), 0);
  if(totalEnviados > 0){
    console.log('[Lembretes] ' + totalEnviados + ' lembrete(s) de retorno enviado(s) nesta checagem.');
  }
  return resumo;
}

module.exports = { verificarLembretesTodasClinicas, verificarLembretesDaClinica };
