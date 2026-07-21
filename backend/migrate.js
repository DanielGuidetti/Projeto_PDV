const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const SUPABASE_URL = '';
const SUPABASE_KEY = '';

const dbPath = path.resolve(__dirname, '../dados/database.sqlite');
const db = new sqlite3.Database(dbPath);

async function fetchSupabase(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    if (!res.ok) {
        console.error(`Failed to fetch ${table}:`, await res.text());
        return [];
    }
    return await res.json();
}

async function migrate() {
    console.log("Iniciando migração do Supabase para SQLite...");
    
    try {
        const produtos = await fetchSupabase('produtos');
        const vendas = await fetchSupabase('vendas');
        const movimentacoes = await fetchSupabase('movimentacoes');
        const receitas = await fetchSupabase('receitas');

        console.log(`Baixados do Supabase: \n- ${produtos.length} produtos\n- ${vendas.length} vendas\n- ${movimentacoes.length} movimentações\n- ${receitas.length} receitas.`);

        // Pegar o primeiro usuário local para associar os registros
        db.get("SELECT id FROM usuarios LIMIT 1", (err, user) => {
            if (err || !user) {
                console.error("Nenhum usuário local encontrado! O sistema não possui dono para assinalar os registros.");
                return;
            }
            const userId = user.id;
            console.log("Vinculando todos os dados importados ao usuário local ID:", userId);

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                // Limpar tabelas para evitar conflito de IDs
                db.run("DELETE FROM produtos");
                db.run("DELETE FROM vendas");
                db.run("DELETE FROM movimentacoes");
                db.run("DELETE FROM receitas");

                // Inserir Produtos
                const stmtProd = db.prepare("INSERT INTO produtos (id, PLU, nome, custo, preco, estoque, pesavel, controlar_estoque, permitir_estoque_negativo, user_id, referencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                for (const p of produtos) {
                    stmtProd.run(p.id, p.PLU, p.nome, p.custo, p.preco, p.estoque, p.pesavel ? 1 : 0, p.controlar_estoque ? 1 : 0, p.permitir_estoque_negativo ? 1 : 0, userId, p.referencia || null);
                }
                stmtProd.finalize();

                // Inserir Vendas
                const stmtVenda = db.prepare("INSERT INTO vendas (id, data, forma_pagamento, total, itens, user_id, totalItens, cliente, status, data_conclusao, status_entrega, valor_pago, troco) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                for (const v of vendas) {
                    // SQLite "YYYY-MM-DD HH:MM:SS"
                    let dataFormated = v.data ? v.data.replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19);
                    let pgto = v.metodo_pagamento || v.forma_pagamento || 'DINHEIRO';
                    let totalItens = typeof v.itens === 'string' ? JSON.parse(v.itens).length : (v.itens ? v.itens.length : 0);
                    let dataConclusao = v.data_conclusao ? v.data_conclusao.replace('T', ' ').substring(0, 19) : null;
                    stmtVenda.run(
                        v.id, dataFormated, pgto, v.total, 
                        typeof v.itens === 'string' ? v.itens : JSON.stringify(v.itens), 
                        userId, totalItens, 
                        v.cliente || null, 
                        v.status || 'CONCLUIDA', 
                        dataConclusao, 
                        v.status_entrega || 'PENDENTE', 
                        v.valor_pago || 0, 
                        v.troco || null
                    );
                }
                stmtVenda.finalize();

                // Inserir Movimentacoes
                const stmtMov = db.prepare("INSERT INTO movimentacoes (id, data_movimentacao, produto_id, tipo, quantidade, motivo, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
                for (const m of movimentacoes) {
                    let dataFormated = m.data_movimentacao ? m.data_movimentacao.replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19);
                    stmtMov.run(m.id, dataFormated, m.produto_id, m.tipo, m.quantidade, m.motivo, userId);
                }
                stmtMov.finalize();

                // Inserir Receitas
                const stmtRec = db.prepare("INSERT INTO receitas (id, nome, rendimento, custo_total, custo_unitario, ingredientes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
                for (const r of receitas) {
                    stmtRec.run(r.id, r.nome, r.rendimento, r.custo_total, r.custo_unitario, typeof r.ingredientes === 'string' ? r.ingredientes : JSON.stringify(r.ingredientes), userId);
                }
                stmtRec.finalize();

                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error("Erro na transação:", err);
                    } else {
                        console.log("=> Migração concluída com sucesso! Todos os dados foram importados.");
                    }
                });
            });
        });
    } catch(err) {
        console.error("Ocorreu um erro ao fazer fetch do Supabase:", err);
    }
}

migrate();
