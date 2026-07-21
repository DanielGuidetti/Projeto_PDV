const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const env = process.env.NODE_ENV || 'production';
const dbFile = env === 'homologacao' ? 'database_homol.sqlite' : 'database.sqlite';
const dbPath = path.resolve(__dirname, '../dados', dbFile);

console.log(`[BANCO DE DADOS] Conectando ao banco: ${dbFile}`);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Usuarios
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    `);

    // 2. Produtos
    db.run(`
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            PLU TEXT NOT NULL,
            nome TEXT NOT NULL,
            custo REAL,
            preco REAL NOT NULL DEFAULT 0.00,
            estoque REAL NOT NULL DEFAULT 0,
            pesavel INTEGER NOT NULL DEFAULT 0,
            controlar_estoque INTEGER NOT NULL DEFAULT 1,
            permitir_estoque_negativo INTEGER NOT NULL DEFAULT 0,
            user_id INTEGER NOT NULL,
            referencia TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(PLU, user_id)
        )
    `);

    // Migração: Adicionar coluna referencia se não existir
    db.all("PRAGMA table_info(produtos)", (err, columns) => {
        if (columns && !columns.find(c => c.name === 'referencia')) {
            db.run("ALTER TABLE produtos ADD COLUMN referencia TEXT");
            console.log("[MIGRAÇÃO] Coluna 'referencia' adicionada à tabela produtos.");
        }
    });

    // 3. Vendas
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP,
            total REAL NOT NULL DEFAULT 0.00,
            totalItens INTEGER NOT NULL DEFAULT 0,
            cliente TEXT,
            forma_pagamento TEXT NOT NULL,
            itens TEXT NOT NULL, -- JSON
            status TEXT NOT NULL DEFAULT 'CONCLUIDA',
            data_conclusao DATETIME,
            status_entrega TEXT DEFAULT 'PENDENTE',
            valor_pago REAL DEFAULT 0,
            troco REAL,
            user_id INTEGER NOT NULL
        )
    `);

    // 4. Movimentacoes
    db.run(`
        CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            produto_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            quantidade REAL NOT NULL,
            motivo TEXT,
            user_id INTEGER NOT NULL
        )
    `);

    // 5. Configuração da Loja
    db.run(`
        CREATE TABLE IF NOT EXISTS store_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            nome_loja TEXT NOT NULL DEFAULT 'Mercearia',
            endereco TEXT,
            rodape_recibo TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 6. Configuração da Balança
    db.run(`
        CREATE TABLE IF NOT EXISTS scale_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            prefix_length INTEGER NOT NULL DEFAULT 1,
            plu_length INTEGER NOT NULL DEFAULT 4,
            value_length INTEGER NOT NULL DEFAULT 5,
            value_type TEXT NOT NULL DEFAULT 'price'
        )
    `);

    // 7. Movimentações Financeiras
    db.run(`
        CREATE TABLE IF NOT EXISTS movimentacoes_financeiras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP,
            tipo TEXT NOT NULL,
            valor REAL NOT NULL DEFAULT 0.00,
            descricao TEXT NOT NULL,
            categoria TEXT,
            user_id INTEGER NOT NULL
        )
    `);

    // 8. Receitas
    db.run(`
        CREATE TABLE IF NOT EXISTS receitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            rendimento REAL NOT NULL DEFAULT 1,
            custo_total REAL NOT NULL DEFAULT 0.00,
            custo_unitario REAL NOT NULL DEFAULT 0.00,
            ingredientes TEXT NOT NULL DEFAULT '[]', -- JSON
            user_id INTEGER NOT NULL
        )
    `);
});

module.exports = db;
