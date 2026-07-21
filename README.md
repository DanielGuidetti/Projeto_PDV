# PDV Mercearia - Manual do Usuario

Bem-vindo ao sistema de Ponto de Venda (PDV) da sua Mercearia! 
Este documento e o seu manual de instrucoes rapido para entender como a estrutura do sistema funciona no dia a dia.

---

## Como Iniciar o Sistema

Para ligar o servidor e abrir a pagina do sistema, voce tem dois atalhos principais na sua pasta principal:

1. iniciar.bat: Este e o sistema oficial de producao. Tudo o que voce registrar e vender usando este botao ficara salvo no banco de dados oficial da sua loja.
2. iniciar_testes.bat: Este e o seu Modo de Homologacao (Testes). Se voce quiser testar alguma funcao, treinar um funcionario novo, ou fazer vendas de brincadeira para ver como sai o recibo, use este arquivo! Ele usa um banco de dados temporario (database_homol.sqlite) e NAO afeta o seu estoque real.

Importante: Sempre mantenha a telinha preta (CMD) aberta enquanto estiver usando o sistema. Se voce fecha-la, o sistema perdera a conexao com o banco de dados.

---

## Como Fazer Backup (Copia de Seguranca)

Como o sistema e 100% local, voce nao depende da internet, mas precisa cuidar dos seus dados para nao perder caso o computador queime ou estrague.

Para fazer um backup:
1. Feche o sistema (telinha preta).
2. Abra a pasta dados do seu sistema.
3. Copie o arquivo database.sqlite (este e o seu banco de dados oficial com todo o seu dinheiro e estoque!).
4. Cole esse arquivo num Pendrive ou no Google Drive/OneDrive.

Dica: Faca isso pelo menos uma vez por semana!

---

## Esqueci a Senha de um Funcionario

Se voce ou um funcionario esquecerem a senha de acesso ao sistema, siga os passos:

1. De dois cliques no arquivo recuperar_senha.bat.
2. Digite o seu PIN de Seguranca (O padrao e 0310).
3. Digite o E-mail do funcionario.
4. Digite a Nova Senha que ele passara a usar.
5. Pronto! O funcionario ja pode abrir o sistema e logar com a nova senha.

(Se quiser mudar o PIN de seguranca, clique com o botao direito no arquivo backend/reset_senha.js, escolha "Abrir com Bloco de Notas", troque o PIN na linha 26 e salve).

---

## Como ver os Dados (Como se fosse no Excel)

Caso voce precise ver uma lista de todos os usuarios, arrumar um estoque manualmente ou editar qualquer informacao nos bastidores do sistema:

1. Baixe um programa gratuito chamado DB Browser for SQLite (https://sqlitebrowser.org).
2. Instale e abra o programa.
3. Clique em "Abrir Banco de Dados" e selecione o arquivo dados/database.sqlite.
4. Va na aba "Navegar por Dados" e escolha a tabela que quer ver (ex: produtos).
5. Voce podera editar os dados visualmente! Quando terminar, lembre-se de clicar em "Escrever Modificacoes" para salvar.

---

## Estrutura de Pastas (Para Curiosos)

Caso voce esteja se perguntando o que e cada pasta:
- frontend: Guarda todo o visual (telas, botoes, cores e imagens). 
- backend: Guarda o motor do sistema (as regras, acesso aos dados e servidor Node.js).
- dados: Guarda os arquivos com todas as suas informacoes salvas (arquivos SQLite).
