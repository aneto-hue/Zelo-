// ============================================================
// ENVIO DE WHATSAPP (via 360dialog — WhatsApp Business API oficial)
// ------------------------------------------------------------
// As credenciais são de responsabilidade do DONO DO SISTEMA (não de cada
// clínica), configuradas como variáveis de ambiente no servidor:
//   WHATSAPP_360DIALOG_API_KEY  -> chave de API da conta 360dialog
//   WHATSAPP_TEMPLATE_NAME      -> nome do modelo de mensagem aprovado
//   WHATSAPP_TEMPLATE_LANG      -> idioma do modelo (ex: pt_BR)
//
// Se a chave não estiver configurada, o envio é apenas SIMULADO (log no
// console) — assim o sistema já funciona/testa sem travar por falta de
// credencial, e passa a enviar de verdade assim que configurar.
// ============================================================
const BASE_URL = 'https://waba-v2.360dialog.io';

function credenciaisConfiguradas(){
  return !!process.env.WHATSAPP_360DIALOG_API_KEY;
}

// Envia uma mensagem de modelo (template) já aprovado pela Meta.
// telefone: string só com números, com DDI (ex: "5544999998888")
// variaveis: array de strings, na ordem dos {{1}}, {{2}}... do modelo aprovado
async function enviarMensagemWhatsApp(telefone, variaveis){
  const apiKey = process.env.WHATSAPP_360DIALOG_API_KEY;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'lembrete_retorno';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

  if(!apiKey){
    console.log('[WhatsApp] (SIMULADO — sem WHATSAPP_360DIALOG_API_KEY configurada) Enviaria para ' + telefone + ':', variaveis);
    return { ok: true, simulado: true };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: telefone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        { type: 'body', parameters: variaveis.map(v => ({ type: 'text', text: String(v) })) }
      ]
    }
  };

  try{
    const resp = await fetch(BASE_URL + '/messages', {
      method: 'POST',
      headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok){
      console.error('[WhatsApp] Erro ao enviar para ' + telefone + ':', resp.status, JSON.stringify(data));
      return { ok: false, erro: data };
    }
    return { ok: true, resposta: data };
  }catch(e){
    console.error('[WhatsApp] Falha de rede ao enviar para ' + telefone + ':', e.message);
    return { ok: false, erro: e.message };
  }
}

module.exports = { enviarMensagemWhatsApp, credenciaisConfiguradas, notificarProfissionalAguardando };

// Notifica o profissional (não o paciente) que alguém está aguardando na recepção.
// Usa um modelo (template) aprovado SEPARADO do lembrete de retorno, configurado via
// WHATSAPP_TEMPLATE_NAME_AGUARDANDO (padrão: 'paciente_aguardando').
async function notificarProfissionalAguardando(telefoneProfissional, nomePaciente){
  const apiKey = process.env.WHATSAPP_360DIALOG_API_KEY;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME_AGUARDANDO || 'paciente_aguardando';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

  if(!apiKey){
    console.log('[WhatsApp] (SIMULADO — sem WHATSAPP_360DIALOG_API_KEY configurada) Avisaria '+telefoneProfissional+': paciente '+nomePaciente+' está aguardando.');
    return { ok: true, simulado: true };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: telefoneProfissional,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        { type: 'body', parameters: [{ type:'text', text: String(nomePaciente) }] }
      ]
    }
  };

  try{
    const resp = await fetch(BASE_URL + '/messages', {
      method: 'POST',
      headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok){
      console.error('[WhatsApp] Erro ao avisar profissional '+telefoneProfissional+':', resp.status, JSON.stringify(data));
      return { ok: false, erro: data };
    }
    return { ok: true, resposta: data };
  }catch(e){
    console.error('[WhatsApp] Falha de rede ao avisar profissional '+telefoneProfissional+':', e.message);
    return { ok: false, erro: e.message };
  }
}
