ZELO — Sistema de gestão para clínicas odontológicas
==================================================================================

O QUE É
--------
Versão hospedável e MULTI-CLÍNICA do sistema — ou seja, dá para instalar
uma vez e vender/oferecer para várias clínicas diferentes usarem o MESMO
sistema, cada uma com seus próprios dados completamente isolados (uma
clínica nunca vê pacientes, agenda, fichas ou financeiro de outra). Inclui:
  - Cadastro self-service de clínica (qualquer um cria a própria clínica
    e vira administrador dela, sem precisar de mim para configurar).
  - Login por profissional (com senha), com profissionais presos à
    própria clínica.
  - Portal do paciente por link único (sem senha), para pré-preenchimento
    de dados pessoais e questionário de saúde.
  - Módulos: Ficha de Anamnese, Prontuário, Agendamento, Estoque, Financeiro.
  - Perfil da Clínica (nome, logo, cores, dados de contato, equipe) — cada
    clínica configura o próprio.
  - Cadastro de pacientes compartilhado entre todos os módulos (dentro de
    cada clínica).

Para publicar de verdade (acessível pela internet), siga o DEPLOY.md.


CRIAR UM ÍCONE/ATALHO NA ÁREA DE TRABALHO (Windows)
--------------------------------------------------------
1. Dentro desta pasta, dê dois cliques em:
     CRIAR-ATALHO-NA-AREA-DE-TRABALHO.vbs
2. Se aparecer um aviso de segurança do Windows, clique em "Executar
   assim mesmo" (ou "Mais informações" > "Executar assim mesmo").
3. Uma mensagem confirma que o atalho "Sistema da Clínica" foi criado
   na sua Área de Trabalho, com um ícone colorido personalizado.
4. Dali em diante, é só dar dois cliques nesse atalho para abrir o
   sistema — ele já faz tudo sozinho (inicia o servidor e abre o
   navegador).


ACESSANDO DE OUTROS APARELHOS NA MESMA REDE WI-FI
------------------------------------------------------
Quando o sistema estiver rodando (janela preta aberta), ela mostra uma
linha como:
    Rede:  http://192.168.0.15:3000
Esse é o endereço que outros computadores/tablets/celulares NA MESMA
REDE WI-FI da clínica podem usar para acessar — não funciona fora
dessa rede. Para acesso de qualquer lugar (inclusive o portal do
paciente por link, funcionando de verdade), é necessário publicar o
sistema seguindo o DEPLOY.md.


TESTAR NO SEU COMPUTADOR — JEITO MAIS FÁCIL (recomendado)
--------------------------------------------------------------
1. Instale o Node.js uma vez (https://nodejs.org, botão "LTS").
2. Dentro desta pasta, dê DOIS CLIQUES em:
   - Windows: INSTALAR-E-RODAR.bat
   - Mac: Instalar-e-Rodar.command
     (no Mac, se aparecer aviso de segurança na primeira vez, clique
     com o botão direito no arquivo > "Abrir", e confirme "Abrir".)
3. Uma janela preta vai abrir sozinha, instalar o necessário (só na
   primeira vez) e iniciar o sistema. O navegador abre sozinho em
   alguns segundos, na tela de login.
4. Clique em "Ainda não tem uma clínica cadastrada? Criar conta" e
   preencha o nome da clínica, seu nome, e-mail e senha — isso já cria
   sua clínica e sua conta de administrador.
5. Para usar de novo depois, é só dar dois cliques no mesmo arquivo e
   entrar com o e-mail/senha que você cadastrou.
   NÃO feche essa janela preta enquanto estiver usando o sistema.


TESTAR NO SEU COMPUTADOR — JEITO MANUAL (linha de comando)
---------------------------------------------------------------
1. Instale o Node.js (https://nodejs.org), se ainda não tiver.
2. Abra um terminal nesta pasta.
3. Rode:  npm install
4. Rode:  npm start
5. Acesse http://localhost:3000 no navegador — na tela de login,
   clique em "Criar conta" para cadastrar sua clínica e seu usuário
   administrador.


ESTRUTURA DE PASTAS
---------------------
  server/         → todo o código do backend (login, API, armazenamento)
  public/         → todo o front-end (as páginas que o navegador abre)
  dados/          → criada automaticamente; guarda todos os dados salvos
                    (NÃO enviar essa pasta para o GitHub — veja .gitignore)


COMO ATUALIZAR O SISTEMA SEM PERDER DADOS
------------------------------------------------------------------------
O zip que você baixa a cada atualização NUNCA inclui a pasta "dados/"
— ou seja, os arquivos novos só trazem código (server/ e public/),
nunca os pacientes, fichas, agenda etc. que você já tem salvos.

Se você usa o sistema no seu computador (Windows/Mac):
  1. Feche o sistema (feche a janelinha preta/terminal que fica aberta
     rodando ele).
  2. Baixe o zip novo e extraia numa pasta separada, temporária.
  3. Copie os arquivos de dentro dessa pasta nova (a pasta "server/",
     a pasta "public/", e os arquivos soltos como o .bat) para dentro
     da pasta ONDE VOCÊ JÁ TINHA o sistema instalado, sobrescrevendo
     os arquivos antigos quando o Windows perguntar.
  4. NÃO copie/apague a pasta "dados/" da instalação antiga — ela nem
     vem no zip novo, então só de não mexer nela, seus dados continuam
     exatamente como estavam.
  5. Abra o sistema de novo (o mesmo atalho de sempre).
  6. No navegador, force um recarregamento completo da página depois
     de abrir (Ctrl+Shift+R no Windows, Cmd+Shift+R no Mac) — isso
     evita que o navegador mostre uma versão antiga guardada em cache.

Se você publicou o sistema no Render (ou outro servidor):
  1. Suba os arquivos novos pro repositório (GitHub) que está conectado
     ao Render — pode ser um "git push" ou substituir os arquivos pela
     interface do GitHub, dependendo de como você configurou.
  2. O Render detecta a mudança e faz o deploy novo automaticamente.
  3. Os dados ficam guardados num disco separado (persistente), que
     não é apagado quando o código é atualizado — só é apagado se você
     mesmo excluir o serviço ou o disco no painel do Render.

Dica geral: antes de qualquer atualização importante, vale a pena usar
o botão "⬇ Baixar backup agora" no Painel do Sistema, só por segurança.


PRINCIPAIS DIFERENÇAS PARA A VERSÃO ANTERIOR (rede local sem login)
------------------------------------------------------------------------
  - Antes: qualquer pessoa na mesma rede Wi-Fi via os dados, sem senha.
  - Agora: é preciso ter uma conta de profissional (e-mail + senha) para
    acessar os módulos internos.
  - Novo: o paciente pode preencher os próprios dados remotamente, através
    de um link único gerado pela clínica (sem precisar de senha).
  - Novo: administradores podem criar/desativar contas de profissionais.


JÁ RESOLVIDO NESTA VERSÃO
-----------------------------
  - Anamnese e Prontuário: cada paciente tem sua própria ficha
    independente (não é mais "uma ficha ativa por vez").
  - Multi-clínica: várias clínicas podem usar a mesma instalação, cada
    uma com dados completamente isolados.
  - Painel do Sistema (/painel-sistema-login.html): você, dono do
    sistema, vê todas as clínicas, controla manualmente o status de
    assinatura de cada uma e pode ativar/desativar o acesso na hora.
  - Lembrete automático de retorno por WhatsApp: cada clínica pode
    ativar (no Perfil da Clínica) o envio automático de mensagem para
    pacientes sem consulta confirmada há X meses. Requer contratar a
    API oficial do WhatsApp Business (ver DEPLOY.md, Passo 6.1).

LIMITAÇÃO ATUAL (transparência)
----------------------------------
O controle de assinatura no Painel do Sistema é MANUAL — você marca o
status (teste/ativa/atrasada/cancelada) e a data de vencimento você
mesmo, olhando o que recebeu. Não há cobrança automática de cartão nem
integração com gateway de pagamento (Stripe, Mercado Pago etc.) — isso
seria a evolução natural se quiser automatizar de vez a parte financeira
do negócio. É só pedir quando for a hora.
