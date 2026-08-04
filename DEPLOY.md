ZELO — GUIA DE PUBLICAÇÃO (RENDER, passo a passo, sem usar linha de comando)
=========================================================================

VISÃO GERAL
------------
Você vai:
  1) Colocar os arquivos num repositório do GitHub (gratuito).
  2) Criar uma conta no Render e conectar esse repositório.
  3) Configurar um "disco persistente" (para os dados não sumirem a cada
     atualização) — isso exige o plano pago mais simples do Render
     (Starter, hoje ~US$7/mês) + um disco pequeno (poucos centavos/mês).

⚠️ IMPORTANTE SOBRE DADOS DE SAÚDE (LGPD)
--------------------------------------------
Este sistema guarda dados sensíveis (saúde dos pacientes). Ele já usa
senha com hash e HTTPS (fornecido automaticamente pelo Render), mas:
  - Troque a senha do administrador assim que possível (ver Passo 5).
  - Não compartilhe links do portal do paciente publicamente (eles dão
    acesso a preencher/alterar dados daquele paciente específico).
  - Vale conversar com um advogado/DPO da clínica sobre consentimento e
    política de privacidade — isso está fora do que o código resolve.


PASSO 1 — Criar conta no GitHub (se ainda não tiver)
-------------------------------------------------------
1. Acesse https://github.com e crie uma conta gratuita.


PASSO 2 — Subir os arquivos para um repositório
----------------------------------------------------
1. No GitHub, clique em "New repository" (Novo repositório).
2. Dê um nome, ex: "zelo". Marque como "Private" (privado).
3. Clique em "Create repository".
4. Na página do repositório recém-criado, clique em "uploading an
   existing file" (ou "Add file" > "Upload files").
5. Arraste TODOS os arquivos e pastas desta entrega (a pasta inteira
   "zelo" (ou o nome que você deu ao baixar), incluindo "server/", "public/", "package.json")
   para dentro da área de upload do GitHub.
6. Clique em "Commit changes" para confirmar o envio.


PASSO 3 — Criar conta no Render e conectar o repositório
--------------------------------------------------------------
1. Acesse https://render.com e crie uma conta gratuita (dá pra usar a
   conta do GitHub para entrar, é mais rápido).
2. No painel do Render, clique em "New +" > "Web Service".
3. Autorize o Render a acessar seus repositórios do GitHub, e escolha
   o repositório que você criou.


PASSO 4 — Configurar o serviço
------------------------------------
Na tela de configuração do novo Web Service, preencha:
  - Name: clinica-odontologica (ou o nome que preferir)
  - Region: escolha a mais próxima (ex: Ohio, se não tiver opção no Brasil)
  - Branch: main
  - Build Command:  npm install
  - Start Command:  npm start
  - Instance Type: escolha "Starter" (plano pago, necessário para o
    disco persistente funcionar de forma confiável)

Antes de criar, adicione um DISCO PERSISTENTE:
  - Procure a seção "Disks" (ou "Advanced" > "Add Disk").
  - Name: dados-clinica
  - Mount Path: /var/data
  - Size: 1 GB já é bastante para começar.

Adicione a VARIÁVEL DE AMBIENTE (seção "Environment"):
  - DATA_DIR = /var/data
  - SUPER_ADMIN_EMAIL = (o e-mail que você, dono do sistema, vai usar para
    acessar o Painel do Sistema — onde você vê todas as clínicas)
  - SUPER_ADMIN_SENHA = (uma senha só sua, não é a mesma das clínicas)

Clique em "Create Web Service".


PASSO 5 — Primeiro acesso
-------------------------------
1. Espere a mensagem "Live" aparecer no painel do Render (leva alguns
   minutos na primeira vez).
2. O Render vai te dar um endereço tipo:
     https://clinica-odontologica.onrender.com
3. Acesse esse endereço — você verá a tela de login.
4. Clique em "Ainda não tem uma clínica cadastrada? Criar conta" e
   preencha o nome da clínica, seu nome, e-mail e senha. Isso já cria
   a clínica e a sua conta de administrador — pronto para usar.
5. Vá em "Perfil da Clínica" (na tela inicial) e complete os dados
   (logo, cores, endereço, equipe).

Cada nova clínica que for usar o sistema (ex: se você for vender para
outras clínicas) repete só o Passo 4 — cada uma cria a própria conta,
com os próprios dados, completamente isolados das demais.


PASSO 6 — Painel do Sistema (só para você, dono do sistema)
------------------------------------------------------------------
Acesse:  https://SEU-ENDERECO/painel-sistema-login.html
Entre com o SUPER_ADMIN_EMAIL e SUPER_ADMIN_SENHA que você configurou
no Passo 4.

Nesse painel você vê TODAS as clínicas cadastradas no sistema, e pode:
  - Ver quantos profissionais cada uma tem.
  - Marcar o status da assinatura: Em teste / Ativa / Atrasada / Cancelada.
  - Definir a data de vencimento da próxima cobrança (controle manual).
  - Escrever observações que só você vê (ex: "negociando desconto").
  - DESATIVAR uma clínica inadimplente — isso bloqueia o acesso de todos os
    profissionais dela IMEDIATAMENTE, mesmo que já estivessem logados.
    Reativar devolve o acesso na hora.

⚠️ Isso NÃO cobra ninguém automaticamente — é um controle manual. Se quiser
cobrança automática (cartão de crédito recorrente, por exemplo), isso exige
integrar um gateway de pagamento (Stripe, Mercado Pago, PagSeguro etc.),
que é um projeto à parte — me avise se quiser evoluir para isso.


PASSO 6.1 — Lembrete automático de retorno por WhatsApp (opcional)
------------------------------------------------------------------------
O sistema já verifica sozinho, todo dia, se algum paciente de alguma
clínica está há muito tempo sem consulta confirmada — mas para ENVIAR de
verdade pelo WhatsApp, você (dono do sistema) precisa contratar a API
oficial do WhatsApp Business uma única vez, para todas as clínicas.

1. Crie uma conta no Meta Business Manager (business.facebook.com), se
   ainda não tiver.
2. Cadastre-se em um provedor oficial (recomendo o 360dialog —
   www.360dialog.com), e vincule um número de telefone à sua conta do
   WhatsApp Business.
3. Crie um MODELO DE MENSAGEM (template) e envie para aprovação da Meta.
   Use 3 variáveis, nessa ordem — o sistema preenche assim:
     {{1}} = nome do paciente
     {{2}} = nome da clínica
     {{3}} = telefone da clínica (para o paciente responder/ligar)
   Exemplo de texto para o modelo:
     "Olá {{1}}! Já faz um tempo desde sua última consulta na {{2}}.
     Que tal agendar seu retorno? Responda esta mensagem ou ligue
     para {{3}}."
   Dê um nome ao modelo (ex: "lembrete_retorno") e anote o idioma
   escolhido (ex: "pt_BR").
4. Depois que o modelo for APROVADO pela Meta (pode levar algumas horas),
   pegue sua chave de API no 360dialog e adicione estas VARIÁVEIS DE
   AMBIENTE no Render (junto das outras, no Passo 4):
     WHATSAPP_360DIALOG_API_KEY = (a chave de API do 360dialog)
     WHATSAPP_TEMPLATE_NAME     = lembrete_retorno  (ou o nome que você usou)
     WHATSAPP_TEMPLATE_LANG     = pt_BR              (ou o idioma que você usou)
5. Pronto. A partir daí, qualquer clínica que ativar a opção "Lembrete
   automático de retorno" no Perfil da Clínica dela passa a ter os
   lembretes enviados de verdade, automaticamente, todo dia.

Enquanto essas variáveis não estiverem configuradas, o sistema continua
funcionando normalmente — só que os envios ficam "simulados" (aparecem
no log do servidor, mas não saem de verdade), então dá pra testar todo
o resto sem custo nenhum antes de contratar o WhatsApp de verdade.

Para testar manualmente a qualquer momento (sem esperar o dia seguinte),
use o botão "▶ Testar agora" na seção "Lembretes de retorno" do Painel
do Sistema.


PASSO 6.2 — Backup automático para o Google Drive (opcional)
------------------------------------------------------------------------
O backup MANUAL (baixar um arquivo) já funciona sem nenhuma configuração
extra — é só usar o botão "⬇ Baixar backup agora" no Painel do Sistema
sempre que quiser. Para o backup AUTOMÁTICO diário direto no Google
Drive, siga estes passos (feitos uma única vez):

1. Acesse https://console.cloud.google.com e crie um projeto (gratuito),
   se ainda não tiver um.
2. No menu, vá em "APIs e Serviços" > "Biblioteca", procure por
   "Google Drive API" e clique em "Ativar".
3. Vá em "APIs e Serviços" > "Credenciais" > "Criar credenciais" >
   "Conta de serviço". Dê um nome (ex: "backup-clinica") e conclua.
4. Clique na conta de serviço criada > aba "Chaves" > "Adicionar chave"
   > "Criar nova chave" > formato JSON. Um arquivo .json será baixado —
   guarde-o em local seguro, ele não pode ser baixado de novo depois.
5. Abra esse arquivo .json baixado num editor de texto. Você vai
   precisar de dois campos de dentro dele:
     "client_email"  -> vai virar a variável GOOGLE_SERVICE_ACCOUNT_EMAIL
     "private_key"   -> vai virar a variável GOOGLE_SERVICE_ACCOUNT_KEY
6. No seu Google Drive normal (o seu, pessoal ou da empresa), crie uma
   pasta para guardar os backups (ex: "Backups Clínica"). Clique com o
   botão direito nela > "Compartilhar" > cole o "client_email" da conta
   de serviço (do passo 5) e dê permissão de "Editor".
7. Pegue o ID dessa pasta: abra ela no navegador, o ID é o trecho final
   do endereço, depois de "folders/" (ex: .../folders/AQUI_ESTA_O_ID).
8. No Render, adicione estas VARIÁVEIS DE AMBIENTE (junto das outras):
     GOOGLE_SERVICE_ACCOUNT_EMAIL = (o "client_email" do passo 5)
     GOOGLE_SERVICE_ACCOUNT_KEY   = (o "private_key" do passo 5, cole
                                      exatamente como está no arquivo,
                                      incluindo as quebras de linha "\n")
     GOOGLE_DRIVE_FOLDER_ID       = (o ID da pasta, do passo 7)
9. Pronto. A partir da próxima vez que o servidor reiniciar, um backup
   completo (todas as clínicas) é enviado automaticamente pro Drive
   assim que o servidor sobe, e depois todo dia. Também dá pra disparar
   na hora, pelo botão "☁ Enviar para o Google Drive agora" no Painel
   do Sistema.

⚠️ Restaurar um backup (seção "avançado" do Painel do Sistema) SUBSTITUI
todos os dados de todas as clínicas pelos dados do arquivo escolhido, e
desloga todo mundo (inclusive você) — use só em recuperação de desastre,
nunca por engano.


PASSO 7 — Usando o portal do paciente
--------------------------------------------
1. Na tela inicial, na lista de pacientes, clique no ícone 🔗 ao lado
   do nome do paciente.
2. O link é copiado automaticamente (ou aparece numa caixa para copiar).
3. Envie esse link para o paciente (WhatsApp, SMS, e-mail).
4. O paciente abre o link no celular dele, preenche os dados, e envia —
   sem precisar de senha nem instalar nada.
5. Os dados aparecem automaticamente no cadastro do paciente no sistema.


ATUALIZAÇÕES FUTURAS
------------------------
Sempre que eu (ou você) alterar algum arquivo, é só enviar os arquivos
atualizados para o mesmo repositório do GitHub (Passo 2) — o Render
detecta a mudança e publica a nova versão automaticamente, sem apagar
os dados (que ficam no disco persistente, separados do código).


DÚVIDAS COMUNS
------------------
- "Errei a senha e não consigo entrar" → peça para outro administrador
  da mesma clínica trocar sua senha em "Perfil da Clínica". Se você é o
  único administrador, me avise — dá para redefinir direto nos dados.
- "Quero trocar de plano/hospedagem depois" → é só copiar a pasta
  "dados/" (via download manual pelo painel) para o novo lugar — todas
  as clínicas cadastradas vão junto.
- "Vendi o sistema para outra clínica, como ela começa a usar?" → ela
  mesma acessa o endereço do sistema e clica em "Criar conta" na tela
  de login — não precisa de nenhuma configuração manual da sua parte.
