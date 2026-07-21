@echo off
title PDV Mercearia - Servidor Local
echo Iniciando Servidor Local...
echo.

:: Entra na pasta do backend
cd backend

:: Verifica se a pasta node_modules existe. Se nao, instala.
if not exist node_modules (
    echo Instalando dependencias na primeira vez, aguarde...
    call npm install
)

:: Inicia o servidor e aguarda 2 segundos
start /b node server.js
timeout /t 2 /nobreak >nul

:: Abre o navegador padrao no localhost
start http://localhost:3000

echo.
echo Servidor rodando! Nao feche esta janela.
echo Pressione qualquer tecla para encerrar o servidor...
pause >nul

:: Quando pressionado qualquer tecla, encerra o node.js
taskkill /IM node.exe /F
exit
