@echo off
title Sistema da Clinica
cd /d "%~dp0"

echo ========================================================
echo   Verificando se o Node.js esta instalado...
echo ========================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Node.js nao foi encontrado neste computador.
    echo.
    echo Baixe e instale em: https://nodejs.org
    echo ^(escolha o botao "LTS"^) e depois rode este arquivo de novo.
    echo.
    pause
    exit /b
)
echo Node.js encontrado, tudo certo!
echo.

if not exist "node_modules" (
    echo ========================================================
    echo   Primeira vez rodando: instalando o sistema...
    echo   ^(isso pode levar um minuto, so acontece uma vez^)
    echo ========================================================
    call npm install
    echo.
)

echo ========================================================
echo   Iniciando o sistema...
echo   NAO FECHE esta janela enquanto estiver usando o sistema.
echo   O navegador vai abrir sozinho em alguns segundos.
echo ========================================================
echo.

start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"

call npm start

echo.
echo O sistema foi encerrado.
pause
