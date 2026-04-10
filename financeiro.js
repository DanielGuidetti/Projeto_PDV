// Seleção automática de Ambiente (Homologação vs Produção)
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

const supabaseUrl = isProd 
    ? 'https://ljuonnxlpwrrpoiezwyk.supabase.co' 
    : 'https://vbjtdgjdyducsfzrvsxn.supabase.co';

const supabaseKey = isProd 
    ? 'sb_publishable_n8OsbUrccQQcm1VselnSBw_MoOPbeeK' 
    : 'sb_publishable_ue0z_icioGphdp0TiE5zog_xGjyy9lw';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: { storageKey: 'mercearia_auth_session' }
});

const formatMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
}).format(new Date(date));

const appState = {
    currentUser: null,
    vendas: [],
    transacoes: []
};

// Obter usuário da sessão
const checkAuth = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
    } else {
        appState.currentUser = session.user;
        loadData();
    }
};

const showToast = (message, type = 'info') => {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Modal Logic
const transModal = document.getElementById('transaction-modal');
document.getElementById('btn-new-transaction').addEventListener('click', () => {
    document.getElementById('transaction-form').reset();
    document.getElementById('trans-date').valueAsDate = new Date();
    transModal.classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        transModal.classList.remove('active');
    });
});

// Load Data
const loadData = async () => {
    try {
        const customFilter = document.getElementById('filter-month').value; // YYYY-MM
        
        let vendasQuery = _supabase.from('vendas').select('id, data, total, status').eq('status', 'CONCLUIDA');
        let transQuery = _supabase.from('movimentacoes_financeiras').select('*');

        if (customFilter) {
            const [year, month] = customFilter.split('-');
            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
            
            vendasQuery = vendasQuery.gte('data', startDate).lte('data', endDate);
            transQuery = transQuery.gte('data', startDate).lte('data', endDate);
        }

        const [vendasRes, transRes] = await Promise.all([vendasQuery, transQuery]);

        if (vendasRes.error) throw vendasRes.error;
        if (transRes.error) {
            // Caso a tabela ainda não exista (usuário esqueceu de rodar SQL)
            if (transRes.error.code === '42P01') {
                showToast('Tabela "movimentacoes_financeiras" não encontrada no Supabase. Aguardando setup.', 'warning');
                appState.transacoes = [];
            } else {
                throw transRes.error;
            }
        } else {
            appState.transacoes = transRes.data;
        }

        appState.vendas = vendasRes.data;
        renderDashboard();

    } catch (e) {
        console.error('Erro ao carregar dados financeiros', e);
        showToast('Erro ao carregar dados financeiros.', 'error');
    }
};

const renderDashboard = () => {
    const tbody = document.getElementById('finance-table-body');
    const emptyMsg = document.getElementById('empty-finance-msg');
    
    // Combine data for timeline extract
    const extrato = [];
    
    // Totalizers
    let totalVendas = 0;
    let totalReceitasExtras = 0;
    let totalDespesas = 0;
    
    const expensesByCategory = {};
    const individualExpenses = [];

    appState.vendas.forEach(v => {
        totalVendas += Number(v.total);
        extrato.push({
            dataOrig: new Date(v.data),
            data: v.data,
            tipo: 'venda',
            classificacao: 'RECEITA (VENDAS)',
            descricao: `Venda #${v.id}`,
            valor: Number(v.total)
        });
    });

    appState.transacoes.forEach(t => {
        const val = Number(t.valor);
        if (t.tipo === 'RECEITA') totalReceitasExtras += val;
        if (t.tipo === 'DESPESA') {
            totalDespesas += val;
            const cat = t.categoria || 'OUTROS';
            expensesByCategory[cat] = (expensesByCategory[cat] || 0) + val;
            individualExpenses.push({descricao: t.descricao, valor: val, dataOrig: new Date(t.data), cat: cat});
        }

        extrato.push({
            dataOrig: new Date(t.data),
            data: t.data,
            tipo: t.tipo.toLowerCase(),
            classificacao: t.tipo,
            descricao: t.categoria ? `[${t.categoria}] ${t.descricao}` : t.descricao,
            valor: val
        });
    });

    // Ordenar do mais recente pro mais antigo
    extrato.sort((a, b) => b.dataOrig - a.dataOrig);

    const saldoLiquido = totalVendas + totalReceitasExtras - totalDespesas;

    // Update KPIs (Aba Geral)
    document.getElementById('kpi-total-vendas').textContent = formatMoney(totalVendas);
    document.getElementById('kpi-outras-receitas').textContent = formatMoney(totalReceitasExtras);
    document.getElementById('kpi-despesas').textContent = formatMoney(totalDespesas);
    
    const saldoEl = document.getElementById('kpi-saldo-liquido');
    saldoEl.textContent = formatMoney(saldoLiquido);
    saldoEl.style.color = saldoLiquido >= 0 ? '#fff' : '#f87171'; // vermelho se no vermelho mesmo

    tbody.innerHTML = '';
    if (extrato.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');

        extrato.forEach(mov => {
            const tr = document.createElement('tr');
            let badgeClass = '';
            let signal = '';
            let valColor = '';

            if (mov.tipo === 'venda') {
                 badgeClass = 'badge-venda';
                 signal = '+';
                 valColor = 'text-info';
            } else if (mov.tipo === 'receita') {
                 badgeClass = 'badge-receita';
                 signal = '+';
                 valColor = 'text-success';
            } else if (mov.tipo === 'despesa') {
                 badgeClass = 'badge-despesa';
                 signal = '-';
                 valColor = 'text-danger';
            }

            tr.innerHTML = `
                <td><span class="text-muted">${formatDate(mov.data)}</span></td>
                <td><span class="badge ${badgeClass}">${mov.classificacao}</span></td>
                <td><strong>${mov.descricao}</strong></td>
                <td class="text-right"><strong class="${valColor}">${signal} ${formatMoney(mov.valor)}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- TAB DESPESAS: Gráfico & Top Gastos ---
    const chartContainer = document.getElementById('expenses-chart-container');
    chartContainer.innerHTML = '';
    if (totalDespesas === 0) {
        chartContainer.innerHTML = '<p class="text-muted text-center py-4">Sem dados para análise.</p>';
    } else {
        const sortedCats = Object.entries(expensesByCategory).sort((a,b)=>b[1]-a[1]);
        sortedCats.forEach(([cat, val]) => {
            const pct = Math.round((val / totalDespesas) * 100);
            chartContainer.innerHTML += `
                <div style="margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
                        <span>${cat} <span class="text-muted">(${pct}%)</span></span>
                        <span>${formatMoney(val)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${pct}%; height: 100%; background: var(--warning-color); border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        });
    }

    const topList = document.getElementById('top-expenses-list');
    topList.innerHTML = '';
    individualExpenses.sort((a,b)=>b.valor-a.valor).slice(0, 5).forEach(exp => {
        topList.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--border-glass-light);">
                <div>
                    <h4 style="font-size: 0.95rem; margin-bottom: 0.25rem;">${exp.descricao}</h4>
                    <span class="badge" style="background: rgba(255,255,255,0.05);">${exp.cat}</span>
                </div>
                <strong class="text-danger">${formatMoney(exp.valor)}</strong>
            </div>
        `;
    });
    if(individualExpenses.length === 0) topList.innerHTML = '<p class="text-muted">Nenhum gasto individual registrado.</p>';

    // --- TAB DRE: Fechamento ---
    const custoMercadorias = expensesByCategory['FORNECEDOR'] || 0;
    const receitaBruta = totalVendas + totalReceitasExtras;
    const margem = receitaBruta - custoMercadorias;
    const despOp = totalDespesas - custoMercadorias;
    const lucroFinal = margem - despOp;

    document.getElementById('dre-receita-bruta').textContent = formatMoney(receitaBruta);
    document.getElementById('dre-vendas').textContent = formatMoney(totalVendas);
    document.getElementById('dre-outras').textContent = formatMoney(totalReceitasExtras);
    document.getElementById('dre-custos').textContent = formatMoney(custoMercadorias);
    
    document.getElementById('dre-margem').textContent = formatMoney(margem);
    document.getElementById('dre-margem').style.color = margem < 0 ? 'var(--danger-color)' : 'var(--info-color)';

    document.getElementById('dre-desp-op').textContent = formatMoney(despOp);

    const breakdownContainer = document.getElementById('dre-desp-breakdown');
    breakdownContainer.innerHTML = '';
    for (const [cat, val] of Object.entries(expensesByCategory)) {
        if (cat === 'FORNECEDOR') continue;
        breakdownContainer.innerHTML += `<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><span>${cat}</span><span>${formatMoney(val)}</span></div>`;
    }

    document.getElementById('dre-lucro').textContent = formatMoney(lucroFinal);
    document.getElementById('dre-lucro').style.color = lucroFinal < 0 ? 'var(--danger-color)' : 'var(--success-color)';
};

// Filter Events
document.getElementById('btn-filter').addEventListener('click', loadData);
document.getElementById('btn-clear-filter').addEventListener('click', () => {
    document.getElementById('filter-month').value = '';
    loadData();
});

// Save Transaction
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const tipo = document.getElementById('trans-type').value;
    const categoria = document.getElementById('trans-category').value;
    const descricao = document.getElementById('trans-desc').value.trim();
    const valor = parseFloat(document.getElementById('trans-value').value);
    const dataRef = document.getElementById('trans-date').value;

    let transactionDate = new Date().toISOString();
    if (dataRef) {
        // Usa a data fornecida as 12:00:00 local para evitar deslocamentos de fuso que virem de dia
        transactionDate = new Date(dataRef + 'T12:00:00').toISOString();
    }

    const payload = {
        tipo,
        categoria: categoria || null,
        descricao,
        valor,
        data: transactionDate,
        user_id: appState.currentUser.id
    };

    try {
        const { error } = await _supabase.from('movimentacoes_financeiras').insert([payload]);
        if (error) throw error;
        
        showToast('Transação externa salva com sucesso!', 'success');
        transModal.classList.remove('active');
        e.target.reset();
        await loadData();
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar transação. Verifique se a tabela foi criada!', 'error');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fas fa-check"></i> Salvar Transação';
    }
});

// Tab Navigation logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => {
             b.classList.remove('active', 'btn-primary');
             b.classList.add('btn-ghost');
        });
        const targetBtn = e.currentTarget;
        targetBtn.classList.remove('btn-ghost');
        targetBtn.classList.add('active', 'btn-primary');

        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
        document.getElementById(targetBtn.dataset.target).classList.remove('hidden');
    });
});

checkAuth();
