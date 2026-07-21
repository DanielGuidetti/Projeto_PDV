const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const readline = require('readline');
const path = require('path');

const dbPath = path.resolve(__dirname, '../dados', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl._writeToOutput = function _writeToOutput(stringToWrite) {
    if (rl.stdoutMuted && stringToWrite !== '\r\n' && stringToWrite !== '\n') {
        rl.output.write("*");
    } else {
        rl.output.write(stringToWrite);
    }
};

console.log("=========================================");
console.log("    RECUPERAÇÃO DE SENHA DO SISTEMA");
console.log("=========================================");

const PIN_MESTRE = "0310"; // Você pode alterar este PIN depois

rl.stdoutMuted = false;
rl.question('Digite o PIN de Seguranca do Servidor: ', (pin) => {
    rl.stdoutMuted = false;
    
    if (pin !== PIN_MESTRE) {
        console.log("\n❌ PIN Incorreto! Acesso negado.");
        process.exit(1);
    }

    rl.question('\nDigite o E-mail do usuário que deseja recuperar: ', (email) => {
        if (!email) {
            console.log("E-mail não pode ser vazio.");
            process.exit(1);
        }

        db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, user) => {
            if (err) {
                console.error("Erro ao buscar usuário:", err.message);
                process.exit(1);
            }

            if (!user) {
                console.log(`\n❌ Nenhum usuário encontrado com o e-mail: ${email}`);
                console.log("Feche esta janela e tente novamente.");
                process.exit(1);
            }

            rl.stdoutMuted = false;
            rl.question('\nDigite a NOVA SENHA que você quer usar: ', (novaSenha) => {
                rl.stdoutMuted = false;
                if (!novaSenha) {
                    console.log("A senha não pode ser vazia.");
                    process.exit(1);
                }

                const hash = bcrypt.hashSync(novaSenha, 8);

                db.run('UPDATE usuarios SET password = ? WHERE email = ?', [hash, email], function(updateErr) {
                    if (updateErr) {
                        console.error("Erro ao atualizar senha:", updateErr.message);
                        process.exit(1);
                    }

                    console.log(`\n✅ Sucesso! A senha do usuário ${email} foi alterada.`);
                    console.log("\nAcesse o sistema e use a sua nova senha para entrar.");
                    console.log("Pressione Ctrl+C ou feche a janela para sair.");
                    process.exit(0);
                });
            });
            rl.stdoutMuted = true; // Muta a digitação da senha
        });
    });
    // O E-mail NÃO é mutado, então não mudamos o estado aqui
});
rl.stdoutMuted = true; // Muta a digitação do PIN
