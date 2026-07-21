require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'mercearia_secreta_local_jwt_key';

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend'))); // Serve os arquivos estáticos (HTML/CSS/JS)

// --- Middleware de Autenticação ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
        req.user = user;
        next();
    });
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================
app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

    const hash = bcrypt.hashSync(password, 8);

    db.run('INSERT INTO usuarios (email, password) VALUES (?, ?)', [email, hash], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email já cadastrado.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Usuário cadastrado com sucesso!', id: this.lastID });
    });
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: 'Muitas tentativas de login falhas. Tente novamente em 15 minutos.' }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Email ou senha inválidos.' });

        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) return res.status(401).json({ error: 'Email ou senha inválidos.' });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ session: { access_token: token, user: { id: user.id, email: user.email } } });
    });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});


// ==========================================
// ROTAS CRUD PADRONIZADAS (Helper)
// ==========================================
const createGetRoute = (path, table, orderBy = 'id DESC') => {
    app.get(path, authenticateToken, (req, res) => {
        db.all(`SELECT * FROM ${table} ORDER BY ${orderBy}`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Parse JSON fields if they exist
            const processedRows = rows.map(r => {
                if(r.itens) r.itens = JSON.parse(r.itens);
                if(r.ingredientes) r.ingredientes = JSON.parse(r.ingredientes);
                return r;
            });
            res.json({ data: processedRows });
        });
    });
};

const createDeleteRoute = (path, table) => {
    app.delete(`${path}/:id`, authenticateToken, (req, res) => {
        db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Deletado com sucesso' });
        });
    });
};

// ==========================================
// PRODUTOS
// ==========================================
createGetRoute('/api/produtos', 'produtos', 'nome ASC');
createDeleteRoute('/api/produtos', 'produtos');

app.post('/api/produtos', authenticateToken, (req, res) => {
    const { PLU, nome, custo, preco, estoque, pesavel, controlar_estoque, permitir_estoque_negativo, referencia } = req.body;
    db.run(
        `INSERT INTO produtos (PLU, nome, custo, preco, estoque, pesavel, controlar_estoque, permitir_estoque_negativo, referencia, user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [PLU, nome, custo, preco, estoque, pesavel ? 1 : 0, controlar_estoque ? 1 : 0, permitir_estoque_negativo ? 1 : 0, referencia || null, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
    const { PLU, nome, custo, preco, estoque, pesavel, controlar_estoque, permitir_estoque_negativo, referencia } = req.body;
    
    let updateQuery = `UPDATE produtos SET PLU=?, nome=?, custo=?, preco=?, pesavel=?, controlar_estoque=?, permitir_estoque_negativo=?, referencia=?`;
    let params = [PLU, nome, custo, preco, pesavel ? 1 : 0, controlar_estoque ? 1 : 0, permitir_estoque_negativo ? 1 : 0, referencia || null];
    
    if (estoque !== undefined) {
        updateQuery += `, estoque=?`;
        params.push(estoque);
    }
    
    updateQuery += ` WHERE id = ?`;
    params.push(req.params.id);

    db.run(updateQuery, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: [{ id: req.params.id }] });
    });
});

// ==========================================
// VENDAS
// ==========================================
createGetRoute('/api/vendas', 'vendas', 'data DESC');

app.post('/api/vendas', authenticateToken, (req, res) => {
    const { total, totalItens, cliente, forma_pagamento, itens, status, valor_pago, troco } = req.body;
    db.run(
        `INSERT INTO vendas (total, totalItens, cliente, forma_pagamento, itens, status, valor_pago, troco, user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [total, totalItens, cliente, forma_pagamento, JSON.stringify(itens), status || 'CONCLUIDA', valor_pago, troco, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

app.put('/api/vendas/:id', authenticateToken, (req, res) => {
    const { status, data_conclusao, status_entrega } = req.body;
    let query = `UPDATE vendas SET status = ?`;
    const params = [status];
    
    if (data_conclusao !== undefined) {
        query += `, data_conclusao = ?`;
        params.push(data_conclusao);
    }
    if (status_entrega !== undefined) {
        query += `, status_entrega = ?`;
        params.push(status_entrega);
    }
    
    query += ` WHERE id = ?`;
    params.push(req.params.id);

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: [{ id: req.params.id }] });
    });
});

// ==========================================
// MOVIMENTAÇÕES
// ==========================================
createGetRoute('/api/movimentacoes', 'movimentacoes', 'data_movimentacao DESC');

app.post('/api/movimentacoes', authenticateToken, (req, res) => {
    const { produto_id, tipo, quantidade, motivo } = req.body;
    db.run(
        `INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, user_id) VALUES (?, ?, ?, ?, ?)`,
        [produto_id, tipo, quantidade, motivo, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

// ==========================================
// CONFIGURAÇÕES (Store & Scale)
// ==========================================
app.get('/api/store_configs', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM store_configs ORDER BY id LIMIT 1`, [], (err, row) => {
        res.json({ data: row ? [row] : [] });
    });
});

app.post('/api/store_configs', authenticateToken, (req, res) => {
    const { nome_loja, endereco, rodape_recibo } = req.body;
    db.run(
        `INSERT INTO store_configs (user_id, nome_loja, endereco, rodape_recibo) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET nome_loja=excluded.nome_loja, endereco=excluded.endereco, rodape_recibo=excluded.rodape_recibo`,
        [1, nome_loja, endereco, rodape_recibo],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

app.get('/api/scale_configs', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM scale_configs ORDER BY id LIMIT 1`, [], (err, row) => {
        res.json({ data: row ? [row] : [] });
    });
});

app.post('/api/scale_configs', authenticateToken, (req, res) => {
    const { prefix_length, plu_length, value_length, value_type } = req.body;
    db.run(
        `INSERT INTO scale_configs (user_id, prefix_length, plu_length, value_length, value_type) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET prefix_length=excluded.prefix_length, plu_length=excluded.plu_length, value_length=excluded.value_length, value_type=excluded.value_type`,
        [1, prefix_length, plu_length, value_length, value_type],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

// ==========================================
// FINANCEIRO
// ==========================================
createGetRoute('/api/movimentacoes_financeiras', 'movimentacoes_financeiras', 'data DESC');
createDeleteRoute('/api/movimentacoes_financeiras', 'movimentacoes_financeiras');

app.post('/api/movimentacoes_financeiras', authenticateToken, (req, res) => {
    const { tipo, valor, descricao, categoria, data } = req.body;
    db.run(
        `INSERT INTO movimentacoes_financeiras (tipo, valor, descricao, categoria, data, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [tipo, valor, descricao, categoria, data || new Date().toISOString(), req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

createGetRoute('/api/receitas', 'receitas', 'nome ASC');
createDeleteRoute('/api/receitas', 'receitas');

app.post('/api/receitas', authenticateToken, (req, res) => {
    const { nome, rendimento, custo_total, custo_unitario, ingredientes } = req.body;
    db.run(
        `INSERT INTO receitas (nome, rendimento, custo_total, custo_unitario, ingredientes, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, rendimento, custo_total, custo_unitario, JSON.stringify(ingredientes), req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: this.lastID }] });
        }
    );
});

app.put('/api/receitas/:id', authenticateToken, (req, res) => {
    const { nome, rendimento, custo_total, custo_unitario, ingredientes } = req.body;
    db.run(
        `UPDATE receitas SET nome=?, rendimento=?, custo_total=?, custo_unitario=?, ingredientes=? WHERE id=?`,
        [nome, rendimento, custo_total, custo_unitario, JSON.stringify(ingredientes), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: [{ id: req.params.id }] });
        }
    );
});


app.listen(PORT, () => {
    const envStr = process.env.NODE_ENV === 'homologacao' ? '[MODO DE TESTES/HOMOLOGAÇÃO]' : '[MODO DE PRODUÇÃO]';
    console.log(`\n================================`);
    console.log(`${envStr} Servidor rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT}`);
    console.log(`================================\n`);
});
