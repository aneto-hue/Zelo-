#!/bin/bash
cd "$(dirname "$0")"

echo "========================================================"
echo "  Verificando se o Node.js esta instalado..."
echo "========================================================"
if ! command -v node &> /dev/null; then
    echo ""
    echo "ERRO: Node.js nao foi encontrado neste computador."
    echo ""
    echo "Baixe e instale em: https://nodejs.org"
    echo "(escolha o botao \"LTS\") e depois rode este arquivo de novo."
    echo ""
    read -p "Aperte Enter para fechar..."
    exit 1
fi
echo "Node.js encontrado, tudo certo!"
echo ""

if [ ! -d "node_modules" ]; then
    echo "========================================================"
    echo "  Primeira vez rodando: instalando o sistema..."
    echo "  (isso pode levar um minuto, so acontece uma vez)"
    echo "========================================================"
    npm install
    echo ""
fi

echo "========================================================"
echo "  Iniciando o sistema..."
echo "  NAO FECHE esta janela enquanto estiver usando o sistema."
echo "  O navegador vai abrir sozinho em alguns segundos."
echo "========================================================"
echo ""

(sleep 3 && open http://localhost:3000) &

npm start

echo ""
echo "O sistema foi encerrado."
read -p "Aperte Enter para fechar..."
