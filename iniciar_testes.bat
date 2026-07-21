@echo off
title PDV Mercearia - MODO DE TESTES (Homologacao)
echo ==========================================
echo   ATENCAO: VOCE ESTA INICIANDO O SISTEMA
echo             EM MODO DE TESTES
echo ==========================================
echo.
echo Tudo o que for cadastrado ou vendido agora ficara
echo em um banco de dados separado (database_homol.sqlite).
echo Suas vendas reais nao serao afetadas.
echo.

set NODE_ENV=homologacao
cd backend
start /b node server.js
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo Servidor de TESTES rodando! Nao feche esta janela.
echo Pressione qualquer tecla para encerrar os testes...
pause >nul

taskkill /IM node.exe /F
exit
