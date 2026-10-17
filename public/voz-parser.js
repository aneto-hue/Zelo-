// ============================================================
// LEITOR DE FRASES DO ASSISTENTE DE VOZ
// ------------------------------------------------------------
// Transforma uma frase falada (já transcrita) em itens do odontograma:
//   "dente 46 problema, tratamento de canal, mil e oitocentos reais"
//   -> dente 46, estado Problema, tratamento "Tratamento de canal", valor 1800
// Funciona no navegador e no Node (para testes). Não usa internet nem custa nada.
// Estados: 0 = Sem alteração, 1 = Problema, 2 = Tratado, 3 = Ausente.
// ============================================================
(function(raiz, fabrica){
  if(typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.VozParser = fabrica();
})(typeof self !== 'undefined' ? self : this, function(){

  const DENTES_VALIDOS = new Set([
    11,12,13,14,15,16,17,18, 21,22,23,24,25,26,27,28, 31,32,33,34,35,36,37,38, 41,42,43,44,45,46,47,48,   // permanentes
    51,52,53,54,55, 61,62,63,64,65, 71,72,73,74,75, 81,82,83,84,85                                         // decíduos
  ]);

  const NUM_PALAVRA = {
    zero:0, um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10, onze:11, doze:12,
    treze:13, catorze:14, quatorze:14, quinze:15, dezesseis:16, dezasseis:16, dezessete:17, dezassete:17, dezoito:18, dezenove:19, dezanove:19,
    vinte:20, trinta:30, quarenta:40, cinquenta:50, sessenta:60, setenta:70, oitenta:80, noventa:90,
    cem:100, cento:100, duzentos:200, duzentas:200, trezentos:300, trezentas:300, quatrocentos:400, quatrocentas:400,
    quinhentos:500, quinhentas:500, seiscentos:600, seiscentas:600, setecentos:700, setecentas:700,
    oitocentos:800, oitocentas:800, novecentos:900, novecentas:900
  };

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Quebra o texto em palavras e números (mantém "1.800,00" e "R$ 350" inteiros).
  function tokenizar(texto){
    const re = /r\$\s?\d[\d.,]*\d|r\$\s?\d|\d[\d.,]*\d|\d|[a-zA-ZÀ-ÿ]+(?:-[a-zA-ZÀ-ÿ]+)*/gi;
    return (String(texto || '').match(re) || []).map(orig => ({ orig, k: norm(orig) }));
  }

  function lerDigitos(orig){
    const marcado = /^r\$/i.test(orig);
    let limpo = orig.replace(/^r\$\s?/i, '');
    if(/,\d{1,2}$/.test(limpo)) limpo = limpo.replace(/\./g, '').replace(',', '.');   // 1.800,00
    else limpo = limpo.replace(/[.,]/g, '');                                             // 1.800 ou 1800
    const n = parseFloat(limpo);
    return isNaN(n) ? null : { valor: n, marcado };
  }

  // Lê um número a partir da posição i. Devolve { valor, fim (posição seguinte), marcado } ou null.
  function lerNumero(tk, i){
    if(i >= tk.length) return null;
    if(/^(r\$\s?)?\d/i.test(tk[i].orig)){
      const d = lerDigitos(tk[i].orig);
      return d ? { valor: d.valor, fim: i + 1, marcado: d.marcado } : null;
    }
    let total = 0, atual = 0, usou = false, viuE = false, j = i;
    while(j < tk.length){
      const k = tk[j].k;
      if(k in NUM_PALAVRA){
        if(atual > 0 && !viuE) break;                 // "quatro seis" = dois números (dígito a dígito), não 10
        atual += NUM_PALAVRA[k]; usou = true; viuE = false; j++;
      }
      else if(k === 'mil'){ total += (atual || 1) * 1000; atual = 0; usou = true; viuE = false; j++; }
      else if(k === 'e' && usou && j + 1 < tk.length && (tk[j + 1].k in NUM_PALAVRA || tk[j + 1].k === 'mil')){ viuE = true; j++; }
      else break;
    }
    return usou ? { valor: total + atual, fim: j, marcado: false } : null;
  }

  // Número do dente a partir da posição i: aceita "46", "quarenta e seis" e "quatro seis".
  function lerDente(tk, i){
    const n = lerNumero(tk, i);
    if(n && DENTES_VALIDOS.has(n.valor)) return { dente: n.valor, fim: n.fim };
    if(n && n.valor >= 1 && n.valor <= 8 && i + 1 < tk.length){        // "quatro seis"
      const n2 = lerNumero(tk, n.fim);
      if(n2 && n2.valor >= 1 && n2.valor <= 8 && DENTES_VALIDOS.has(n.valor * 10 + n2.valor)) return { dente: n.valor * 10 + n2.valor, fim: n2.fim };
    }
    return null;
  }

  const ESTADO_PALAVRAS = {
    ausente: 3, ausentes: 3, ausencia: 3, faltando: 3, perdido: 3, perdidos: 3,
    tratado: 2, tratados: 2, restaurado: 2, restaurados: 2, concluido: 2, finalizado: 2,
    problema: 1, problemas: 1, problematico: 1,
  };
  const ENFEITES_INICIO = new Set(['com', 'de', 'do', 'da', 'para', 'fazer', 'realizar', 'precisa', 'necessita', 'indicado', 'indicada',
    'proposto', 'proposta', 'e', 'o', 'a', 'um', 'uma', 'que', 'no', 'na', 'valor', 'custa', 'por', 'procedimento']);
  const DE_VALOR = new Set(['valor', 'custa', 'por', 'de', 'no', 'em', 'a']);

  // Palavras que descrevem o que foi encontrado (situação/diagnóstico) e palavras que começam um procedimento.
  const CONDICOES = new Set(['carie', 'cariado', 'cariada', 'fratura', 'fraturado', 'fraturada', 'trinca', 'trincado', 'quebrado', 'quebrada',
    'mobilidade', 'abscesso', 'infeccao', 'sensibilidade', 'desgaste', 'erosao', 'reabsorcao', 'lesao', 'fistula', 'dor', 'gengivite',
    'periodontite', 'impactado', 'incluso', 'retido', 'inflamacao', 'mancha']);
  const PROC_INICIO = new Set(['tratamento', 'restauracao', 'canal', 'extracao', 'exodontia', 'coroa', 'faceta', 'implante', 'protese',
    'profilaxia', 'limpeza', 'clareamento', 'raspagem', 'endodontia', 'selante', 'pino', 'nucleo', 'enxerto', 'cirurgia', 'aplicacao',
    'remocao', 'troca', 'resina', 'extrair', 'restaurar', 'trocar', 'remover']);

  function maiuscula(s){ s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function limparTexto(palavras){
    let p = palavras.slice();
    while(p.length && ENFEITES_INICIO.has(p[0].k)) p.shift();
    while(p.length && (p[p.length - 1].k === 'e' || p[p.length - 1].k === 'de' || p[p.length - 1].k === 'com')) p.pop();
    return maiuscula(p.map(x => x.orig).join(' '));
  }

  // Separa os procedimentos de um trecho: cada valor "fecha" um procedimento.
  function lerProcedimentos(tk){
    const itens = []; let acumulado = []; let i = 0;
    while(i < tk.length){
      const n = lerNumero(tk, i);
      const proximo = n ? tk[n.fim] : null;
      const seguidoDeReais = proximo && (proximo.k === 'reais' || proximo.k === 'real');
      const aceita = n && (n.marcado || seguidoDeReais || n.valor >= 50);
      if(aceita){
        // remove "no valor de / por" que ficou colado antes do número
        while(acumulado.length && DE_VALOR.has(acumulado[acumulado.length - 1].k)) acumulado.pop();
        itens.push({ tratamento: limparTexto(acumulado), valor: n.valor });
        acumulado = []; i = n.fim + (seguidoDeReais ? 1 : 0);
        continue;
      }
      if(tk[i].k !== 'reais' && tk[i].k !== 'real') acumulado.push(tk[i]);
      i++;
    }
    const resto = limparTexto(acumulado);
    if(resto) itens.push({ tratamento: resto, valor: null });
    return itens;
  }

  function acharProcedimento(tk, procedimentos){
    const texto = ' ' + tk.map(t => t.k).join(' ') + ' ';
    let melhor = null;
    (procedimentos || []).forEach(p => {
      const nome = ' ' + norm(p.nome).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
      if(nome.trim() && texto.includes(nome) && (!melhor || nome.length > melhor.tamanho)) melhor = { proc: p, tamanho: nome.length };
    });
    return melhor ? melhor.proc : null;
  }

  function interpretarSegmentoDente(tk, procedimentos, avisos, textoOriginal){
    // tk[0] é a palavra "dente"/"dentes"/"elemento"
    let i = 1;
    const dentes = [];
    let d = lerDente(tk, i);
    if(!d){ avisos.push('Não entendi o número do dente em: "' + textoOriginal + '".'); return { itens: [], outros: [] }; }
    dentes.push(d.dente); i = d.fim;
    while(i < tk.length){                       // "dentes 14 e 15", "14, 15 e 16"
      let j = i;
      if(tk[j] && (tk[j].k === 'e' || tk[j].k === 'ao')) j++;
      const d2 = lerDente(tk, j);
      if(d2 && j !== i || (d2 && /^\d/.test(tk[j] ? tk[j].orig : ''))){ if(!dentes.includes(d2.dente)) dentes.push(d2.dente); i = d2.fim; }
      else break;
    }
    let resto = tk.slice(i);
    // estado
    let estado = null; const semEstado = [];
    for(let a = 0; a < resto.length; a++){
      const k = resto[a].k;
      if(k === 'sem' && resto[a + 1] && resto[a + 1].k === 'alteracao'){ estado = 0; a++; continue; }
      if(k === 'normal' || k === 'saudavel' || k === 'higido'){ estado = 0; continue; }
      if(k in ESTADO_PALAVRAS){ estado = ESTADO_PALAVRAS[k]; continue; }
      semEstado.push(resto[a]);
    }
    // situação / diagnóstico (palavra-chave explícita)
    let situacao = '';
    const idxSit = semEstado.findIndex(t => t.k === 'situacao' || t.k === 'diagnostico');
    let paraProc = semEstado;
    if(idxSit >= 0){
      let fim = semEstado.length;
      for(let a = idxSit + 1; a < semEstado.length; a++){ if(semEstado[a].k === 'tratamento' || semEstado[a].k === 'procedimento' || semEstado[a].k === 'valor'){ fim = a; break; } }
      situacao = limparTexto(semEstado.slice(idxSit + 1, fim));
      paraProc = semEstado.slice(0, idxSit).concat(semEstado.slice(fim));
    }
    if(!situacao && paraProc.length && CONDICOES.has(paraProc[0].k)){
      const idxP = paraProc.findIndex(t => PROC_INICIO.has(t.k));
      if(idxP > 0){ situacao = limparTexto(paraProc.slice(0, idxP)); paraProc = paraProc.slice(idxP); }
      else if(idxP === -1 && !lerProcedimentos(paraProc).some(x => x.valor !== null)){ situacao = limparTexto(paraProc); paraProc = []; }
    }
    let procs = lerProcedimentos(paraProc);
    // procedimento cadastrado no Estoque
    const cad = acharProcedimento(paraProc, procedimentos);
    if(cad){
      const valorCad = cad.valorSugerido ? parseFloat(cad.valorSugerido) : null;
      const falado = procs.find(p => p.valor !== null);
      procs = [{ tratamento: cad.nome, valor: falado ? falado.valor : valorCad, procedimentoNome: cad.nome }];
    }
    if(estado === null && (procs.length || situacao)) estado = 1;     // há tratamento => Problema
    const itens = dentes.map(dn => ({ dente: dn, estado, situacao, tratamentos: procs.map(p => ({ tratamento: p.tratamento, valor: p.valor })) }));
    return { itens, outros: [] };
  }

  // Ponto de entrada.
  function interpretar(texto, opcoes){
    opcoes = opcoes || {};
    const avisos = []; const itens = []; const outros = [];
    const tk = tokenizar(texto);
    if(!tk.length) return { itens, outros, avisos: ['Não há texto para interpretar.'] };
    // posições onde começa um dente
    let marcas = [];
    tk.forEach((t, i) => { if(t.k === 'dente' || t.k === 'dentes' || t.k === 'elemento') marcas.push(i); });
    if(!marcas.length && lerDente(tk, 0)){ tk.unshift({ orig: 'dente', k: 'dente' }); marcas = [0]; }
    const antes = marcas.length ? tk.slice(0, marcas[0]) : tk;
    // trecho antes do primeiro dente (ou sem dente nenhum) = "outros tratamentos"
    const pedacosOutros = [];
    let cursor = 0; let trechoAtual = antes;
    function juntarOutros(trecho){
      // Só vira "outro tratamento" se tiver valor ou se a pessoa disse "outros tratamentos" (evita aceitar qualquer conversa).
      const intro = trecho.length > 0 && (trecho[0].k === 'outro' || trecho[0].k === 'outros');
      let t = trecho.slice(); while(t.length && ['outro', 'outros', 'tratamento', 'tratamentos', 'geral', 'sem', 'dente'].includes(t[0].k)) t.shift();
      lerProcedimentos(t).forEach(p => {
        if(p.tratamento && (p.valor !== null || intro)) outros.push({ descricao: p.tratamento, valor: p.valor });
        else if(p.tratamento) avisos.push('Ignorei este trecho (sem dente e sem valor): "' + p.tratamento + '".');
      });
    }
    if(antes.length && marcas.length) juntarOutros(antes);
    if(!marcas.length){ juntarOutros(tk); if(!outros.length) avisos.push('Não encontrei nenhum dente na frase. Diga, por exemplo: "dente 46, problema, canal, 1800 reais".'); }
    marcas.forEach((ini, n) => {
      const fim = n + 1 < marcas.length ? marcas[n + 1] : tk.length;
      const seg = tk.slice(ini, fim);
      const original = seg.map(x => x.orig).join(' ');
      const r = interpretarSegmentoDente(seg, opcoes.procedimentos, avisos, original);
      r.itens.forEach(x => itens.push(x));
    });
    return { itens, outros, avisos };
  }

  return { interpretar, lerNumero: (s) => { const r = lerNumero(tokenizar(s), 0); return r ? r.valor : null; }, tokenizar, DENTES_VALIDOS };
});
