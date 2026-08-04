// ============================================================
// APLICA A IDENTIDADE VISUAL DO PERFIL DA CLÍNICA
// ------------------------------------------------------------
// Lê o Perfil da Clínica (nome, logo, cores) salvo em perfil-clinica.html
// e aplica nesta página: cor principal/secundária (sobrescreve o tema) e
// o logo no lugar do "LOGO" genérico, se a página tiver um .logo-box.
// ============================================================
// Converte uma cor "#RRGGBB" em [r,g,b] (formato usado pelo jsPDF). Se inválida, usa o fallback.
function hexParaRgb(hex, fallback){
  if(!hex) return fallback;
  const m = String(hex).replace('#','').match(/^([0-9a-fA-F]{6})$/);
  if(!m) return fallback;
  const num = parseInt(m[1], 16);
  return [(num>>16)&255, (num>>8)&255, num&255];
}
// Clareia uma cor [r,g,b] misturando com branco (quantidade de 0 a 1).
// Usado para gerar tons derivados da cor da clínica (cabeçalhos, faixas, fundos leves).
function clarearCor(rgb, quantidade){
  return rgb.map(c => Math.round(c + (255-c)*quantidade));
}
window.hexParaRgb = hexParaRgb;
window.clarearCor = clarearCor;

// Desenha uma marca d'água bem sutil na página atual do PDF: a logo da clínica (se tiver)
// ou o nome dela como texto diagonal. Só desenha se o perfil tiver marcaDagua ativado.
function desenharMarcaDagua(doc, pageW, pageH, perfil){
  if(!perfil || !perfil.marcaDagua) return;
  const GState = doc.GState;
  try{
    if(perfil.logo){
      const fmt = perfil.logo.includes('image/png') ? 'PNG' : 'JPEG';
      const tamanho = Math.min(pageW, pageH) * 0.55;
      if(GState) doc.setGState(new GState({ opacity: 0.06 }));
      doc.addImage(perfil.logo, fmt, (pageW-tamanho)/2, (pageH-tamanho)/2, tamanho, tamanho);
      if(GState) doc.setGState(new GState({ opacity: 1 }));
    } else if(perfil.nome){
      doc.setFont('helvetica','bold');
      doc.setFontSize(50);
      doc.setTextColor(120,120,120);
      if(GState) doc.setGState(new GState({ opacity: 0.08 }));
      doc.text(perfil.nome, pageW/2, pageH/2, { align:'center', angle:35 });
      if(GState) doc.setGState(new GState({ opacity: 1 }));
    }
  }catch(e){ /* se falhar, só não desenha a marca d'água — não deve travar o PDF */ }
}
window.desenharMarcaDagua = desenharMarcaDagua;

async function aplicarIdentidadeClinica(){
  try{
    const perfil = await ClinicaStorage.load('clinica_perfil_v1');

    // Deixa as cores da clínica sempre disponíveis para os geradores de PDF,
    // mesmo que o perfil ainda não tenha sido configurado (usa as cores padrão).
    window._clinicaCorPrimariaRGB = hexParaRgb(perfil && perfil.corPrimaria, [31,92,139]);
    window._clinicaCorSecundariaRGB = hexParaRgb(perfil && perfil.corSecundaria, [34,224,208]);

    if(!perfil) return null;

    const root = document.documentElement.style;
    if(perfil.corPrimaria){
      root.setProperty('--vibe-blue', perfil.corPrimaria);
      root.setProperty('--ios-blue', perfil.corPrimaria);
    }
    if(perfil.corSecundaria){
      root.setProperty('--vibe-cyan', perfil.corSecundaria);
    }

    const logoBox = document.querySelector('.logo-box');
    if(logoBox && perfil.logo){
      logoBox.innerHTML = '';
      const img = document.createElement('img');
      img.src = perfil.logo;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      logoBox.appendChild(img);
    }

    return perfil;
  }catch(e){
    if(!window._clinicaCorPrimariaRGB) window._clinicaCorPrimariaRGB = [31,92,139];
    if(!window._clinicaCorSecundariaRGB) window._clinicaCorSecundariaRGB = [34,224,208];
    return null;
  }
}
