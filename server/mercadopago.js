// Integração com o Mercado Pago para cobrar a assinatura mensal das clínicas que usam o Zelo.
// Usa o produto "Assinaturas" do Mercado Pago (API de Preapproval), que cobra automaticamente
// todo mês no cartão da clínica, sem precisar de ação manual depois da primeira vez.
//
// Variáveis de ambiente necessárias:
//   MP_ACCESS_TOKEN   -> Access Token de produção (ou teste) da sua conta Mercado Pago
//   MP_VALOR_MENSAL   -> valor fixo da assinatura, em reais (ex: "99.90")
//   URL_BASE_SISTEMA  -> endereço público do sistema (ex: https://zelo-kidh.onrender.com),
//                        usado para o Mercado Pago saber para onde mandar o webhook e o paciente
//                        de volta depois de pagar.

const BASE_URL = 'https://api.mercadopago.com';

function credenciaisConfiguradas(){
  return !!process.env.MP_ACCESS_TOKEN;
}

function valorMensal(){
  return parseFloat(process.env.MP_VALOR_MENSAL) || 99.90;
}

// Cria a assinatura recorrente no Mercado Pago pra uma clínica que acabou de se cadastrar.
// Devolve a URL de checkout (init_point) — é pra lá que a clínica precisa ser levada pra
// autorizar o pagamento recorrente no cartão dela.
async function criarAssinatura({ clinicaId, nomeClinica, email }){
  const token = process.env.MP_ACCESS_TOKEN;
  const urlBase = process.env.URL_BASE_SISTEMA || '';

  if(!token){
    console.log('[Mercado Pago] (SIMULADO — sem MP_ACCESS_TOKEN configurada) Criaria assinatura de R$ '+valorMensal()+'/mês para '+nomeClinica+' ('+email+').');
    return { ok:true, simulado:true, checkoutUrl: null, preapprovalId: null };
  }

  const payload = {
    reason: 'Assinatura Zelo — ' + nomeClinica,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: valorMensal(),
      currency_id: 'BRL'
    },
    payer_email: email,
    back_url: urlBase ? (urlBase + '/pagamento-confirmado.html') : undefined,
    external_reference: clinicaId,
    status: 'pending'
  };

  try{
    const resp = await fetch(BASE_URL + '/preapproval', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok){
      console.error('[Mercado Pago] Erro ao criar assinatura para '+nomeClinica+':', resp.status, JSON.stringify(data));
      return { ok:false, erro:data };
    }
    return { ok:true, checkoutUrl: data.init_point, preapprovalId: data.id };
  }catch(e){
    console.error('[Mercado Pago] Falha de rede ao criar assinatura:', e.message);
    return { ok:false, erro:e.message };
  }
}

// Consulta o status atual de uma assinatura direto na API do Mercado Pago (usado quando chega
// uma notificação de webhook, pra confirmar o que realmente aconteceu antes de liberar o acesso).
async function consultarAssinatura(preapprovalId){
  const token = process.env.MP_ACCESS_TOKEN;
  if(!token || !preapprovalId) return null;
  try{
    const resp = await fetch(BASE_URL + '/preapproval/' + preapprovalId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if(!resp.ok) return null;
    return await resp.json();
  }catch(e){
    console.error('[Mercado Pago] Falha ao consultar assinatura '+preapprovalId+':', e.message);
    return null;
  }
}

// Cancela a cobrança recorrente (usado se a clínica cancelar o uso do sistema)
async function cancelarAssinatura(preapprovalId){
  const token = process.env.MP_ACCESS_TOKEN;
  if(!token || !preapprovalId) return { ok:true, simulado:true };
  try{
    const resp = await fetch(BASE_URL + '/preapproval/' + preapprovalId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    return { ok: resp.ok };
  }catch(e){
    return { ok:false, erro:e.message };
  }
}

module.exports = { credenciaisConfiguradas, valorMensal, criarAssinatura, consultarAssinatura, cancelarAssinatura };
