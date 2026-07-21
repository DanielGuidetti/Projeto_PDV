const state = {
    currentUser: null,
    userRole: 'user',
    scaleConfig: null,
    receiptConfig: {
        storeName: 'Nova Astari',
        footerMsg: 'Obrigado {cliente}, volte sempre!'
    },
    currentReportPage: 1,
    products: [],
    sales: [],
    cart: [],
    movimentacoes: [],
    receitas: [],
    pendingSaleForPrint: null,
    scalePort: null,
    scaleReader: null,
    scaleKeepReading: false,
    currentScaleWeight: 0,
    isScaleConnected: false
};

/* ===== API Local Initialization (Substituindo Supabase) ===== */
const getToken = () => localStorage.getItem('mercearia_token');
function showDisconnectError() {
    if (document.getElementById('disconnect-overlay')) return;
    const div = document.createElement('div');
    div.id = 'disconnect-overlay';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.95);z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;color:white;text-align:center;backdrop-filter:blur(10px);';
    div.innerHTML = '<i class="fas fa-plug-circle-xmark" style="font-size:5rem;color:#ef4444;margin-bottom:1.5rem;"></i><h1 style="margin:0;font-family:Outfit,sans-serif;font-size:2rem;">Sem Conexão com o Servidor Local</h1><p style="margin-top:1rem;color:#94a3b8;font-family:Inter,sans-serif;max-width:400px;line-height:1.5;">O banco de dados foi desligado ou ocorreu uma falha.<br><br>Por favor, vá até a pasta <b>Mercearia</b> e dê dois cliques no arquivo <b>iniciar.bat</b> para religá-lo.</p><button onclick="window.location.reload()" class="btn btn-primary" style="margin-top:2rem;">Tentar Novamente</button>';
    document.body.appendChild(div);
}

setInterval(() => {
    fetch('/api/health').catch(() => showDisconnectError());
}, 3000);

const req = async (path, options = {}) => {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(`/api${path}`, { ...options, headers });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('mercearia_token');
                localStorage.removeItem('mercearia_user');
                window.location.href = 'index.html';
                return;
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erro na API');
        }
        return res.json();
    } catch(err) {
        if (err.message === 'Failed to fetch' || err.message === 'Load failed' || err.message.includes('NetworkError')) {
            showDisconnectError();
        }
        throw err;
    }
};

const _supabase = {
    auth: {
        getSession: async () => {
            const token = getToken();
            const user = JSON.parse(localStorage.getItem('mercearia_user') || 'null');
            if (token && user) return { data: { session: { user, access_token: token } } };
            return { data: { session: null }, error: null };
        },
        signOut: async () => {
            localStorage.removeItem('mercearia_token');
            localStorage.removeItem('mercearia_user');
            window.location.href = 'index.html';
        },
        onAuthStateChange: (callback) => {
            // Emulando o listener, chamando imediatamente
            setTimeout(async () => {
                const session = await _supabase.auth.getSession();
                callback('INITIAL_SESSION', session.data.session);
            }, 100);
        }
    },
    from: (table) => {
        let queryOps = [];
        const builder = {
            select: (cols) => { queryOps.push({ type: 'select', cols }); return builder; },
            eq: (col, val) => { queryOps.push({ type: 'eq', col, val }); return builder; },
            gte: (col, val) => { queryOps.push({ type: 'gte', col, val }); return builder; },
            lte: (col, val) => { queryOps.push({ type: 'lte', col, val }); return builder; },
            single: () => { queryOps.push({ type: 'single' }); return builder; },
            insert: (data) => { queryOps.push({ type: 'insert', data }); return builder; },
            update: (data) => { queryOps.push({ type: 'update', data }); return builder; },
            delete: () => { queryOps.push({ type: 'delete' }); return builder; },
            upsert: (data) => { queryOps.push({ type: 'upsert', data }); return builder; },
            then: async (resolve, reject) => {
                try {
                    let result = { data: null, error: null };
                    
                    const isSelect = queryOps.find(op => op.type === 'select');
                    const isInsert = queryOps.find(op => op.type === 'insert');
                    const isUpdate = queryOps.find(op => op.type === 'update');
                    const isDelete = queryOps.find(op => op.type === 'delete');
                    const isUpsert = queryOps.find(op => op.type === 'upsert');
                    const eqFilter = queryOps.find(op => op.type === 'eq');
                    const isSingle = queryOps.find(op => op.type === 'single');
                    const gteFilters = queryOps.filter(op => op.type === 'gte');
                    const lteFilters = queryOps.filter(op => op.type === 'lte');
                    
                    if (isSelect && !isInsert && !isUpdate) {
                        const res = await req(`/${table}`, { method: 'GET' });
                        let rows = res.data || [];
                        if (eqFilter) rows = rows.filter(r => String(r[eqFilter.col]) === String(eqFilter.val));
                        if (gteFilters.length > 0) {
                            gteFilters.forEach(f => { rows = rows.filter(r => new Date(r[f.col]) >= new Date(f.val)); });
                        }
                        if (lteFilters.length > 0) {
                            lteFilters.forEach(f => { rows = rows.filter(r => new Date(r[f.col]) <= new Date(f.val)); });
                        }
                        
                        // Compatibilidade SQLite -> Supabase Booleans
                        if (table === 'produtos') {
                            rows = rows.map(r => ({
                                ...r,
                                pesavel: r.pesavel === 1 || r.pesavel === true,
                                controlar_estoque: r.controlar_estoque === 1 || r.controlar_estoque === true,
                                permitir_estoque_negativo: r.permitir_estoque_negativo === 1 || r.permitir_estoque_negativo === true
                            }));
                        }
                        
                        result.data = isSingle ? (rows[0] || null) : rows;
                    }
                    else if (isInsert) {
                        const payload = Array.isArray(isInsert.data) ? isInsert.data[0] : isInsert.data;
                        const res = await req(`/${table}`, { method: 'POST', body: JSON.stringify(payload) });
                        if (isSelect) result.data = res.data;
                    }
                    else if (isUpdate) {
                        if (eqFilter && eqFilter.col === 'id') {
                            const res = await req(`/${table}/${eqFilter.val}`, { method: 'PUT', body: JSON.stringify(isUpdate.data) });
                            if (isSelect) result.data = res.data;
                        } else {
                            throw new Error('Update requires eq("id", id)');
                        }
                    }
                    else if (isDelete) {
                        if (eqFilter && eqFilter.col === 'id') {
                            await req(`/${table}/${eqFilter.val}`, { method: 'DELETE' });
                        }
                    }
                    else if (isUpsert) {
                        const payload = Array.isArray(isUpsert.data) ? isUpsert.data[0] : isUpsert.data;
                        const res = await req(`/${table}`, { method: 'POST', body: JSON.stringify(payload) });
                        result.data = res.data;
                    }
                    
                    resolve(result);
                } catch(error) {
                    resolve({ data: null, error });
                }
            }
        };
        return builder;
    }
};

/* ===== DOM Elements ===== */
const app = {
    screens: document.querySelectorAll('.screen'),
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('main-content'),
    navLinks: document.querySelectorAll('.nav-links a, .mobile-nav-links a'),
    usernameDisplay: document.getElementById('display-username'),
    toastContainer: document.getElementById('toast-container')
};

/* ===== Utility Functions ===== */
const formatMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (date) => {
    let dateStr = String(date);
    // O SQLite retorna as datas em UTC no formato "YYYY-MM-DD HH:MM:SS" (sem 'T' nem 'Z').
    // Para o navegador converter pro horário local correto, forçamos o formato ISO 8601 UTC.
    if (dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    return new Intl.DateTimeFormat('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateStr));
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const normalizeName = (name) => {
    if (!name) return "";
    return name
        .trim()
        .replace(/\s+/g, ' ')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
};

const toTitleCase = (str) => {
    if (!str) return "";
    const prepositions = ['de', 'da', 'do', 'dos', 'das', 'e'];
    return str.toLowerCase().split(' ').map(word => {
        if (prepositions.includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
};

const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    app.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

/* ===== Navigation & Routing ===== */
const toggleSidebar = (show) => {
    if (show) {
        app.sidebar.classList.remove('hidden');
        app.mainContent.classList.remove('full-width');
    } else {
        app.sidebar.classList.add('hidden');
        app.mainContent.classList.add('full-width');
    }
};

const navigateTo = async (routeId) => {
    if (!state.currentUser && routeId !== 'screen-login' && routeId !== 'screen-register') {
        navigateTo('screen-login');
        return;
    }
    // Removida restrição de admin para configurações (Global)
    app.screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(routeId);
    if (target) target.classList.add('active');

    if (routeId.startsWith('screen-login') || routeId.startsWith('screen-register')) {
        toggleSidebar(false);
    } else {
        toggleSidebar(true);
        const navRoute = routeId.replace('screen-', '');
        app.navLinks.forEach(link => {
            if (link.dataset.route === navRoute) link.classList.add('active');
            else link.classList.remove('active');
        });
        
        if (routeId === 'screen-products') renderProductsTable();
        if (routeId === 'screen-pos') renderPosCatalog();
        if (routeId === 'screen-reports') await renderReports();
        if (routeId === 'screen-stock') renderStockHistory();
        if (routeId === 'screen-encomendas') await renderOrders();
        if (routeId === 'screen-receitas') renderReceitasTable();
    }
};

app.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(`screen-${link.dataset.route}`);
    });
});

/* ===== Data Loading ===== */
const loadData = async () => {
    try {
        // Buscar Configuração da Loja (Global ID 1)
        const { data: storeConfig } = await _supabase.from('store_configs').select('*').eq('id', 1).single();
        if (storeConfig) {
            state.receiptConfig.storeName = storeConfig.nome_loja;
            state.receiptConfig.footerMsg = storeConfig.rodape_recibo;
            state.receiptConfig.address = storeConfig.endereco;
        }

        // Buscar Configuração de Balança (Global ID 1)
        const { data: scaleData } = await _supabase.from('scale_configs').select('*').eq('id', 1).single();
        if (scaleData) {
            state.scaleConfig = scaleData;
        }

        const { data: produtos } = await _supabase.from('produtos').select('*');
        if (produtos) state.products = produtos;
        
        const { data: vendas } = await _supabase.from('vendas').select('*');
        if (vendas) state.sales = vendas;

        const { data: movs } = await _supabase.from('movimentacoes').select('*');
        if (movs) state.movimentacoes = movs;

        const { data: recs } = await _supabase.from('receitas').select('*');
        if (recs) state.receitas = recs;
    } catch (e) {
        console.error('Erro ao carregar dados do Supabase:', e);
        showToast('Erro ao carregar dados.', 'error');
    }
};

/* ===== System Authentication Guard ===== */
// Listener para ações do sistema

document.getElementById('logout-btn').addEventListener('click', async () => {
    await _supabase.auth.signOut();
    window.location.href = 'index.html';
});

// Listener para expiração de sessão
_supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session) {
        state.currentUser = null;
        window.location.href = 'index.html';
    }
});

/* ===== Modules: Products ===== */
const productModal = document.getElementById('product-modal');
const renderProductsTable = (searchTerm = '') => {
    const tbody = document.getElementById('products-table-body');
    const emptyMsg = document.getElementById('empty-products-msg');
    tbody.innerHTML = '';
    
    let filtered = state.products;
    if (searchTerm) {
        const term = normalizeName(searchTerm);
        filtered = filtered.filter(p => normalizeName(p.nome).includes(term) || String(p.PLU).includes(term));
    }
    
    if (filtered.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        filtered.forEach(p => {
            const tr = document.createElement('tr');
            let statusClass = 'badge-success';
            let statusText = 'Em Estoque';
            if (p.controlar_estoque !== false) {
                statusClass = p.estoque > 10 ? 'badge-success' : p.estoque > 0 ? 'badge-warning' : 'badge-danger';
                statusText = p.estoque > 10 ? 'Em Estoque' : p.estoque > 0 ? 'Baixo Estoque' : 'Esgotado';
            } else {
                statusClass = 'badge-info';
                statusText = 'Ilimitado';
            }
            
            let estoqueStr = p.pesavel ? parseFloat(p.estoque).toFixed(3).replace('.',',') + ' kg' : p.estoque + ' un.';
            if (p.controlar_estoque === false) estoqueStr = '--';

            tr.innerHTML = `
                <td><span class="text-muted">#${p.PLU}</span></td>
                <td><strong>${p.nome}</strong> ${p.pesavel ? '<i class="fas fa-balance-scale text-muted" title="Produto pesável" style="margin-left: 0.5rem;"></i>' : ''}</td>
                <td>${formatMoney(p.preco)}</td>
                <td>${estoqueStr}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="text-right">
                    <button class="btn-icon" onclick="editProduct('${p.id}')" title="Editar"><i class="fas fa-edit text-primary"></i></button>
                    <button class="btn-icon" onclick="deleteProduct('${p.id}')" title="Excluir"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

document.getElementById('btn-new-product').addEventListener('click', () => {
    document.getElementById('product-modal-title').textContent = 'Adicionar Novo Produto';
    document.getElementById('prod-id').value = '';
    document.getElementById('product-form').reset();
    toggleStockInput();
    productModal.classList.add('active');
});

const toggleStockInput = () => {
    const isChecked = document.getElementById('prod-control-stock').checked;
    const stockInput = document.getElementById('prod-stock');
    const allowNegativeInput = document.getElementById('prod-allow-negative');
    const isEditing = !!document.getElementById('prod-id').value;
    
    stockInput.disabled = !isChecked || isEditing;
    stockInput.required = isChecked && !isEditing;
    if (allowNegativeInput) allowNegativeInput.disabled = !isChecked;
    if (!isChecked) {
        stockInput.value = '';
    }
};
document.getElementById('prod-control-stock').addEventListener('change', toggleStockInput);

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        productModal.classList.remove('active');
        if(document.getElementById('product-form')) {
            document.getElementById('product-form').reset();
            document.getElementById('prod-id').value = '';
        }
    });
});

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = document.getElementById('prod-id').value;
    let PLU = document.getElementById('prod-code').value.trim();
    const referencia = document.getElementById('prod-ref').value.trim();
    const nome = document.getElementById('prod-name').value.trim();
    const custoVal = document.getElementById('prod-cost').value;
    const custo = custoVal !== '' ? parseFloat(custoVal) : null;
    const preco = parseFloat(document.getElementById('prod-price').value);
    const estoque = parseFloat(document.getElementById('prod-stock').value) || 0;
    const pesavel = document.getElementById('prod-pesavel').checked;
    const controlar_estoque = document.getElementById('prod-control-stock').checked;
    const permitir_estoque_negativo = document.getElementById('prod-allow-negative')?.checked || false;

    // Lógica Segura de PLU Auto-Incremental (Preenchimento de Lacunas)
    if (!PLU && !prodId) {
        const existingPLUs = new Set(state.products.map(p => String(p.PLU)));
        let i = 1;
        while (existingPLUs.has(String(i))) {
            i++;
        }
        PLU = String(i);
    }

    // Prevent duplicate codes locally
    if (state.products.some(p => p.PLU === PLU && String(p.id) !== prodId)) {
        showToast('Código de barras já cadastrado no banco.', 'error');
        return;
    }

    const newProduct = { PLU, nome, preco, custo, estoque, pesavel, controlar_estoque, permitir_estoque_negativo, referencia, user_id: state.currentUser.id }; // id gerado automaticamente pelo banco

    try {
        if (prodId) {
            // Update - Não permite alteração na qtde de estoque já existente
            delete newProduct.estoque;
            const { data, error } = await _supabase.from('produtos').update(newProduct).eq('id', prodId).select();
            if (error) throw error;
            
            const index = state.products.findIndex(p => String(p.id) === prodId);
            if (index !== -1) {
                state.products[index] = data && data.length > 0 && data[0].nome ? data[0] : { ...state.products[index], ...newProduct };
            }
            showToast('Produto atualizado com sucesso!', 'success');
        } else {
            // Insert
            const { data, error } = await _supabase.from('produtos').insert([newProduct]).select();
            if (error) throw error;

            let savedProduct = { ...newProduct };
            if (data && data.length > 0) {
                if (data[0].nome) {
                    savedProduct = data[0];
                } else {
                    savedProduct.id = data[0].id;
                }
            }
            state.products.push(savedProduct);

            if (savedProduct.id && savedProduct.estoque > 0 && savedProduct.controlar_estoque !== false) {
                const newMov = {
                    produto_id: savedProduct.id,
                    tipo: 'ENTRADA',
                    quantidade: savedProduct.estoque,
                    motivo: 'Estoque Inicial (Cadastro)',
                    user_id: state.currentUser.id
                };
                const { data: movData, error: movError } = await _supabase.from('movimentacoes').insert([newMov]).select();
                if (!movError && movData && movData.length > 0) {
                    state.movimentacoes.push(movData[0]);
                    if (typeof renderStockHistory === 'function') renderStockHistory();
                }
            }
            showToast('Produto adicionado com sucesso!', 'success');
        }
        
        productModal.classList.remove('active');
        e.target.reset();
        document.getElementById('prod-id').value = '';
        renderProductsTable();
    } catch(err) {
        showToast('Erro ao salvar produto no banco.', 'error');
        console.error(err);
    }
});

window.editProduct = (id) => {
    const product = state.products.find(p => String(p.id) === String(id));
    if (!product) return;

    document.getElementById('product-modal-title').textContent = 'Editar Produto';
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-code').value = product.PLU;
    document.getElementById('prod-ref').value = product.referencia || '';
    document.getElementById('prod-name').value = product.nome;
    document.getElementById('prod-cost').value = product.custo !== null && product.custo !== undefined ? product.custo : '';
    document.getElementById('prod-price').value = product.preco;
    document.getElementById('prod-stock').value = product.estoque;
    document.getElementById('prod-pesavel').checked = !!product.pesavel;
    document.getElementById('prod-control-stock').checked = product.controlar_estoque !== false;
    if (document.getElementById('prod-allow-negative')) {
        document.getElementById('prod-allow-negative').checked = !!product.permitir_estoque_negativo;
    }
    toggleStockInput();

    productModal.classList.add('active');
};

document.getElementById('products-search')?.addEventListener('input', (e) => {
    renderProductsTable(e.target.value);
});

window.deleteProduct = async (id) => {
    if (confirm('Deseja realmente remover este produto do sistema?')) {
        try {
            const { error } = await _supabase.from('produtos').delete().eq('id', id);
            if (error) throw error;

            state.products = state.products.filter(p => String(p.id) !== String(id));
            renderProductsTable();
            showToast('Produto removido do banco.', 'info');
        } catch(err) {
            showToast('Erro ao remover produto do banco.', 'error');
            console.error(err);
        }
    }
};
/* ===== Modules: Receitas ===== */
const recipeCalcModal = document.getElementById('recipe-calculator-modal');
const btnNewRecipe = document.getElementById('btn-new-recipe');
const btnCloseCalcModals = document.querySelectorAll('.close-calc-modal');
const btnAddIngredient = document.getElementById('btn-add-ingredient');
const btnAddLabel = document.getElementById('btn-add-label');
const btnClearCalc = document.getElementById('btn-clear-calc');
const calcIngredientsBody = document.getElementById('calc-ingredients-body');
const calcTotalCostEl = document.getElementById('calc-total-cost');
const calcUnitCostEl = document.getElementById('calc-unit-cost');
const calcYieldInput = document.getElementById('calc-recipe-yield');
const recipesTableBody = document.getElementById('recipes-table-body');
const emptyRecipesMsg = document.getElementById('empty-recipes-msg');

let calcState = {
    ingredients: [],
    nextId: 1
};

window.renderReceitasTable = (searchTerm = '') => {
    if (!recipesTableBody) return;
    recipesTableBody.innerHTML = '';
    
    let filtered = state.receitas;
    if (searchTerm) {
        const term = normalizeName(searchTerm);
        filtered = filtered.filter(r => normalizeName(r.nome).includes(term));
    }
    
    if (filtered.length === 0) {
        emptyRecipesMsg.classList.remove('hidden');
        recipesTableBody.parentElement.classList.add('hidden');
    } else {
        emptyRecipesMsg.classList.add('hidden');
        recipesTableBody.parentElement.classList.remove('hidden');
        
        filtered.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${r.nome}</strong></td>
                <td>${r.rendimento} un.</td>
                <td style="color: var(--warning-color);">${formatMoney(r.custo_total)}</td>
                <td style="color: var(--success-color); font-weight: bold;">${formatMoney(r.custo_unitario)}</td>
                <td class="text-right">
                    <button class="btn btn-primary btn-small" onclick="viewRecipe('${r.id}')"><i class="fas fa-eye"></i> Visualizar</button>
                </td>
            `;
            recipesTableBody.appendChild(tr);
        });
    }
};

document.getElementById('receitas-search')?.addEventListener('input', (e) => {
    renderReceitasTable(e.target.value);
});

if (btnNewRecipe) {
    btnNewRecipe.addEventListener('click', () => {
        document.getElementById('recipe-modal-title').textContent = 'Cadastrar Receita';
        document.getElementById('calc-recipe-id').value = '';
        clearCalcForm();
        recipeCalcModal.classList.add('active');
    });
}

if (btnCloseCalcModals) {
    btnCloseCalcModals.forEach(btn => {
        btn.addEventListener('click', () => {
            recipeCalcModal.classList.remove('active');
        });
    });
}

const addIngredientRow = (ingredientData = null, isLabel = false) => {
    const id = calcState.nextId++;
    if (ingredientData) {
        calcState.ingredients.push({ id, ...ingredientData });
    } else {
        if (isLabel) {
            calcState.ingredients.push({ id, isLabel: true, name: '', rowCost: 0 });
        } else {
            calcState.ingredients.push({ id, isLabel: false, name: '', packageQty: '', packagePrice: '', recipeQty: '', rowCost: 0 });
        }
    }
    renderCalcTable();
    updateCalcTotals();
};

if (btnAddIngredient) {
    btnAddIngredient.addEventListener('click', () => addIngredientRow());
}
if (btnAddLabel) {
    btnAddLabel.addEventListener('click', () => addIngredientRow(null, true));
}

const clearCalcForm = () => {
    calcState.ingredients = [];
    calcState.nextId = 1;
    document.getElementById('calc-recipe-name').value = '';
    calcYieldInput.value = '1';
    renderCalcTable();
    addIngredientRow();
};

if (btnClearCalc) {
    btnClearCalc.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar o formulário?')) {
            clearCalcForm();
        }
    });
}

if (calcYieldInput) {
    calcYieldInput.addEventListener('input', updateCalcTotals);
}

window.updateCalcRow = (id, field, value) => {
    const ingredient = calcState.ingredients.find(i => i.id === id);
    if (!ingredient) return;

    if (field === 'name') {
        ingredient.name = value;
    } else {
        ingredient[field] = parseFloat(value) || 0;
        
        if (ingredient.packageQty > 0 && ingredient.packagePrice >= 0 && ingredient.recipeQty >= 0) {
            ingredient.rowCost = (ingredient.packagePrice / ingredient.packageQty) * ingredient.recipeQty;
        } else {
            ingredient.rowCost = 0;
        }
        
        const rowCostEl = document.getElementById(`calc-row-cost-${id}`);
        if (rowCostEl) rowCostEl.textContent = formatMoney(ingredient.rowCost);
        
        updateCalcTotals();
    }
};

window.deleteCalcRow = (id) => {
    calcState.ingredients = calcState.ingredients.filter(i => i.id !== id);
    renderCalcTable();
    updateCalcTotals();
};

function updateCalcTotals() {
    const totalCost = calcState.ingredients.reduce((sum, item) => sum + item.rowCost, 0);
    const yieldVal = parseFloat(calcYieldInput.value) || 0;
    
    let unitCost = 0;
    if (yieldVal > 0) {
        unitCost = totalCost / yieldVal;
    }
    
    calcTotalCostEl.textContent = formatMoney(totalCost);
    calcUnitCostEl.textContent = formatMoney(unitCost);
    
    // Store in hidden state so we can save it easily
    calcState.totalCost = totalCost;
    calcState.unitCost = unitCost;
};

function renderCalcTable() {
    if (!calcIngredientsBody) return;
    calcIngredientsBody.innerHTML = '';
    
    if (calcState.ingredients.length === 0) {
       calcIngredientsBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 1rem;">Nenhum ingrediente adicionado.</td></tr>`;
       return;
    }
    
    calcState.ingredients.forEach(item => {
        const tr = document.createElement('tr');
        if (item.isLabel) {
            tr.innerHTML = `
                <td colspan="5" style="background: rgba(255,255,255,0.02); padding-top: 1rem; padding-bottom: 0.2rem;">
                    <input type="text" value="${item.name}" oninput="updateCalcRow(${item.id}, 'name', this.value)" placeholder="Rótulo (ex: Massa, Recheio)" required style="width: 100%; padding: 0.5rem 0; border: none; background: transparent; color: var(--accent-color); font-weight: bold; font-size: 1.1rem; outline: none; border-bottom: 2px solid var(--accent-color);">
                </td>
                <td class="text-right" style="background: rgba(255,255,255,0.02); vertical-align: bottom; padding-top: 1rem; padding-bottom: 0.2rem;">
                    <button type="button" class="btn-icon" onclick="deleteCalcRow(${item.id})" title="Remover Rótulo"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td>
                    <input type="text" value="${item.name}" oninput="updateCalcRow(${item.id}, 'name', this.value)" placeholder="Ex: Farinha" required style="width: 100%; padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; border-radius: 4px;">
                </td>
                <td>
                    <input type="number" min="0" step="any" value="${item.packageQty || ''}" oninput="updateCalcRow(${item.id}, 'packageQty', this.value)" required placeholder="0" style="width: 100%; padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; border-radius: 4px;">
                </td>
                <td>
                    <input type="number" min="0" step="0.01" value="${item.packagePrice || ''}" oninput="updateCalcRow(${item.id}, 'packagePrice', this.value)" required placeholder="0.00" style="width: 100%; padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; border-radius: 4px;">
                </td>
                <td>
                    <input type="number" min="0" step="any" value="${item.recipeQty || ''}" oninput="updateCalcRow(${item.id}, 'recipeQty', this.value)" required placeholder="0" style="width: 100%; padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; border-radius: 4px;">
                </td>
                <td style="font-weight: bold; color: var(--accent-color);" id="calc-row-cost-${item.id}">
                    ${formatMoney(item.rowCost)}
                </td>
                <td class="text-right">
                    <button type="button" class="btn-icon" onclick="deleteCalcRow(${item.id})" title="Remover Ingrediente"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
        }
        calcIngredientsBody.appendChild(tr);
    });
};

/* Form Submit Logic */
document.getElementById('recipe-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('calc-recipe-id').value;
    const nome = document.getElementById('calc-recipe-name').value.trim();
    const rendimento = parseFloat(calcYieldInput.value) || 1;
    const ingredientes = calcState.ingredients.map(i => {
        if (i.isLabel) {
            return {
                isLabel: true,
                name: i.name,
                rowCost: 0
            };
        }
        return {
            isLabel: false,
            name: i.name,
            packageQty: i.packageQty,
            packagePrice: i.packagePrice,
            recipeQty: i.recipeQty,
            rowCost: i.rowCost
        };
    });

    if (ingredientes.length === 0) {
        showToast('Adicione pelo menos um ingrediente.', 'error');
        return;
    }

    const payload = {
        nome,
        rendimento,
        custo_total: calcState.totalCost || 0,
        custo_unitario: calcState.unitCost || 0,
        ingredientes,
        user_id: state.currentUser.id
    };

    try {
        if (id) {
            const { data, error } = await _supabase.from('receitas').update(payload).eq('id', id).select();
            if (error) throw error;
            const idx = state.receitas.findIndex(r => String(r.id) === id);
            if (idx !== -1) state.receitas[idx] = data && data.length > 0 ? data[0] : { ...state.receitas[idx], ...payload };
            showToast('Receita atualizada!', 'success');
        } else {
            const { data, error } = await _supabase.from('receitas').insert([payload]).select();
            if (error) throw error;
            if (data && data.length > 0) state.receitas.push(data[0]);
            showToast('Receita cadastrada com sucesso!', 'success');
        }
        recipeCalcModal.classList.remove('active');
        renderReceitasTable();
    } catch(err) {
        console.error(err);
        showToast('Erro ao salvar receita no banco.', 'error');
    }
});

window.editRecipe = (id) => {
    const receita = state.receitas.find(r => String(r.id) === String(id));
    if (!receita) return;

    document.getElementById('recipe-modal-title').textContent = 'Editar Receita';
    document.getElementById('calc-recipe-id').value = receita.id;
    document.getElementById('calc-recipe-name').value = receita.nome;
    calcYieldInput.value = receita.rendimento;
    
    calcState.ingredients = [];
    calcState.nextId = 1;
    
    if (receita.ingredientes && receita.ingredientes.length > 0) {
        receita.ingredientes.forEach(ing => {
            const rowId = calcState.nextId++;
            calcState.ingredients.push({ id: rowId, ...ing });
        });
    } else {
        addIngredientRow();
    }
    
    renderCalcTable();
    updateCalcTotals();
    recipeCalcModal.classList.add('active');
};

window.deleteRecipe = async (id) => {
    if (confirm('Deseja realmente excluir esta receita permanentemente?')) {
        try {
            const { error } = await _supabase.from('receitas').delete().eq('id', id);
            if (error) throw error;
            state.receitas = state.receitas.filter(r => String(r.id) !== String(id));
            renderReceitasTable();
            showToast('Receita removida.', 'info');
        } catch(err) {
            console.error(err);
            showToast('Erro ao remover receita.', 'error');
        }
    }
};

/* View Recipe Logic */
const recipeViewModal = document.getElementById('recipe-view-modal');
const closeViewModals = document.querySelectorAll('.close-view-modal');

closeViewModals.forEach(btn => {
    btn.addEventListener('click', () => {
        recipeViewModal.classList.remove('active');
    });
});

window.viewRecipe = (id) => {
    const receita = state.receitas.find(r => String(r.id) === String(id));
    if (!receita) return;

    document.getElementById('view-recipe-title').textContent = receita.nome;
    document.getElementById('view-recipe-yield').textContent = receita.rendimento + ' un.';
    document.getElementById('view-recipe-total-cost').textContent = formatMoney(receita.custo_total);
    document.getElementById('view-recipe-unit-cost').textContent = formatMoney(receita.custo_unitario);

    const tbody = document.getElementById('view-recipe-ingredients-body');
    tbody.innerHTML = '';

    if (receita.ingredientes && receita.ingredientes.length > 0) {
        receita.ingredientes.forEach(ing => {
            const tr = document.createElement('tr');
            if (ing.isLabel) {
                tr.innerHTML = `
                    <td colspan="5" style="background: rgba(255,255,255,0.02); color: var(--accent-color); font-weight: bold; font-size: 1.1rem; padding: 1rem 0.5rem 0.5rem 0.5rem; border-bottom: 2px solid var(--accent-color);">
                        ${ing.name}
                    </td>
                `;
            } else {
                tr.innerHTML = `
                    <td><strong>${ing.name}</strong></td>
                    <td>${ing.packageQty || '-'}</td>
                    <td style="color:var(--text-secondary)">${ing.packagePrice ? formatMoney(ing.packagePrice) : '-'}</td>
                    <td>${ing.recipeQty || '-'}</td>
                    <td class="text-right text-success" style="font-weight:bold;">${formatMoney(ing.rowCost || 0)}</td>
                `;
            }
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">Nenhum detalhe de ingrediente salvo.</td></tr>';
    }

    // Handlers for edit and delete inside view modal
    document.getElementById('btn-edit-view-recipe').onclick = () => {
        recipeViewModal.classList.remove('active');
        editRecipe(id);
    };
    
    document.getElementById('btn-delete-view-recipe').onclick = () => {
        recipeViewModal.classList.remove('active');
        deleteRecipe(id);
    };

    recipeViewModal.classList.add('active');
};

/* ===== Modules: POS ===== */
const updateClock = () => {
    const clockEl = document.getElementById('pos-clock');
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('pt-BR');
};
setInterval(updateClock, 1000);
updateClock();

const renderPosCatalog = (searchTerm = '') => {
    const grid = document.getElementById('pos-products-grid');
    grid.innerHTML = '';
    
    const term = searchTerm.trim().toLowerCase();
    
    if (term === '') {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1">
                <i class="fas fa-search" style="font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <p>Digite algo na busca para ver os produtos.</p>
            </div>
        `;
        return;
    }
    
    const filtered = state.products.filter(p => {
        return p.nome.toLowerCase().includes(term) || p.PLU.includes(term) || (p.referencia && p.referencia.toLowerCase().includes(term));
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><p>Nenhum produto encontrado na busca.</p></div>`;
        return;
    }

    filtered.forEach(p => {
        const isOutOfStock = p.controlar_estoque !== false && p.estoque <= 0;
        const card = document.createElement('div');
        card.className = `product-card ${isOutOfStock ? 'opacity-50' : ''}`;
        
        const stockDisplay = p.controlar_estoque === false ? '∞' : (p.pesavel ? parseFloat(p.estoque).toFixed(3).replace('.',',') + 'kg' : p.estoque + ' un.');
        card.innerHTML = `
            <span class="stock">${stockDisplay}</span>
            <span class="code">#${p.PLU}</span>
            <span class="name">${p.nome}</span>
            <span class="price">${formatMoney(p.preco)}</span>
        `;
        card.addEventListener('click', (e) => {
            const currentCard = e.currentTarget;
            currentCard.classList.remove('anim-flash');
            void currentCard.offsetWidth;
            currentCard.classList.add('anim-flash');
            addToCart(p);
        });
        grid.appendChild(card);
    });
};

document.getElementById('pos-search').addEventListener('input', (e) => renderPosCatalog(e.target.value));

const tryParseScaleBarcode = (barcode) => {
    const cfg = state.scaleConfig;
    if (!cfg) return null;
    
    // Suporte robusto para EAN-13 (Padrão de balanças no Brasil)
    // Se o código começa com o prefixo (geralmente 2) e tem 12 ou 13 dígitos
    const isScalePrefix = barcode.startsWith(String(cfg.prefix_length === 1 ? barcode[0] : barcode.substring(0, cfg.prefix_length)));
    
    // Se não parece código de balança pelo prefixo, sai logo
    if (!isScalePrefix) return null;

    const expectedLen = cfg.prefix_length + cfg.plu_length + cfg.value_length + 1; // +1 checksum
    
    // Se o código for EAN-13 (13 dígitos) mas a config somar menos, permitimos o parsing se o prefixo bater
    if (barcode.length !== 13 && barcode.length !== expectedLen && barcode.length !== expectedLen - 1) return null;
    
    // Extracted strings
    const pluStr = barcode.substring(cfg.prefix_length, cfg.prefix_length + cfg.plu_length);
    const valueStr = barcode.substring(cfg.prefix_length + cfg.plu_length, cfg.prefix_length + cfg.plu_length + cfg.value_length);
    
    // Tenta encontrar o produto pelo PLU extraído
    const pluNum = parseInt(pluStr, 10);
    const product = state.products.find(p => (p.PLU === pluStr || String(p.PLU) === String(pluNum)) && p.pesavel);
    
    if (!product) {
        console.warn(`Código de balança detectado mas PLU "${pluStr}" não encontrado ou não é pesável.`);
        return null;
    }

    const parsedValue = parseInt(valueStr, 10);
    if (isNaN(parsedValue)) return null;

    let qty = 1;
    if (cfg.value_type === 'price') {
        qty = Number(((parsedValue / 100) / product.preco).toFixed(3));
    } else {
        qty = Number((parsedValue / 1000).toFixed(3));
    }

    return { product, qty };
};


// Suporte ao Leitor de Código de Barras (Enter)
document.getElementById('pos-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let val = e.target.value.trim();
        if (!val) return;
        
        let qtyMultiplier = 1;
        if (val.includes('*')) {
            const parts = val.split('*');
            if (parts.length === 2 && !isNaN(parts[0]) && Number(parts[0]) > 0) {
                qtyMultiplier = Number(parts[0]);
                val = parts[1].trim(); // o restante é o código do produto
            }
        }
        
        if (!val) return; // caso a pessoa digite só "2*"

        const scaleData = tryParseScaleBarcode(val);
        if (scaleData && scaleData.product) {
            addToCart(scaleData.product, scaleData.qty * qtyMultiplier);
            e.target.value = '';
            renderPosCatalog('');
            return;
        }

        // Busca produto pelo PLU exato ou referência (prioridade para leitor)
        const product = state.products.find(p => p.PLU === val || (p.referencia && String(p.referencia) === val));
        
        if (product) {
            addToCart(product, qtyMultiplier);
            e.target.value = '';
            renderPosCatalog('');
        } else {
            // Se não encontrar por PLU exato, mas houver apenas um resultado filtrado, adiciona ele
            const filtered = state.products.filter(p => {
                const term = val.toLowerCase();
                return p.nome.toLowerCase().includes(term) || p.PLU.includes(term) || (p.referencia && p.referencia.toLowerCase().includes(term));
            });

            if (filtered.length === 1) {
                addToCart(filtered[0], qtyMultiplier);
                e.target.value = '';
                renderPosCatalog('');
            } else {
                showToast('Produto não encontrado pelo código.', 'error');
            }
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.getElementById('screen-pos').classList.contains('active')) {
        e.preventDefault();
        document.getElementById('pos-search').focus();
    }
});

const triggerCartPop = () => {
    const countEl = document.querySelector('.cart-items-count');
    if (countEl) {
        countEl.classList.remove('anim-pop');
        void countEl.offsetWidth;
        countEl.classList.add('anim-pop');
    }
};

const addToCart = (product, requestedQty = 1, fromScaleConfirm = false) => {
    // Intercept if it's a weighable product and we are not confirming from the scale modal
    if (product.pesavel && requestedQty === 1 && !fromScaleConfirm) {
        pendingWeightProduct = product;
        document.getElementById('weight-product-name').textContent = product.nome;
        
        const modal = document.getElementById('weight-capture-modal');
        const activeReader = document.getElementById('weight-reader-active');
        const manualReader = document.getElementById('weight-reader-manual');
        const manualInput = document.getElementById('weight-manual-input');
        
        if (state.isScaleConnected) {
            activeReader.style.display = 'block';
            manualReader.style.display = 'none';
            document.getElementById('weight-live-value').textContent = state.currentScaleWeight.toFixed(3).replace('.', ',') + ' kg';
        } else {
            activeReader.style.display = 'none';
            manualReader.style.display = 'block';
            manualInput.value = '';
        }
        
        modal.classList.add('active');
        if (!state.isScaleConnected) {
            setTimeout(() => manualInput.focus(), 100);
        }
        return;
    }

    const existing = state.cart.find(item => item.product.id === product.id);
    if (existing) {
        if (product.controlar_estoque !== false && product.permitir_estoque_negativo !== true && existing.qty + requestedQty > product.estoque) {
            showToast('Estoque insuficiente para a quantidade.', 'error');
            return;
        }
        existing.qty += requestedQty;
    } else {
        if (product.controlar_estoque !== false && product.permitir_estoque_negativo !== true) {
            if (product.estoque < requestedQty && product.estoque > 0) {
               showToast('Estoque insuficiente.', 'error');
               return;
            }
            if (product.estoque <= 0) {
               showToast('Estoque esgotado.', 'error');
               return;
            }
        }
        state.cart.push({ product, qty: requestedQty });
    }
    renderCart();
    triggerCartPop();
};

window.updateCartQty = (productId, delta) => {
    const item = state.cart.find(i => String(i.product.id) === String(productId));
    if (!item) return;
    
    const newQty = item.qty + delta;
    if (newQty <= 0) {
        state.cart = state.cart.filter(i => String(i.product.id) !== String(productId));
    } else if (item.product.controlar_estoque !== false && item.product.permitir_estoque_negativo !== true && newQty > item.product.estoque) {
        showToast('Limite de estoque atingido.', 'error');
    } else {
        item.qty = newQty;
    }
    renderCart();
    if (delta > 0) triggerCartPop();
};

const renderCart = () => {
    const container = document.getElementById('cart-items-container');
    const countEl = document.querySelector('.cart-items-count');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('btn-checkout');
    const clearBtn = document.getElementById('btn-clear-cart');

    container.innerHTML = '';
    
    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <p>Cesta vazia.<br>Selecione produtos ao lado.</p>
            </div>
        `;
        countEl.textContent = '0 itens';
        subtotalEl.textContent = formatMoney(0);
        totalEl.textContent = formatMoney(0);
        checkoutBtn.disabled = true;
        clearBtn.disabled = true;
        return;
    }

    let totalItens = 0;
    let totalValue = 0;

    state.cart.forEach(item => {
        totalItens += item.product.pesavel ? 1 : item.qty;
        const itemTotal = item.qty * item.product.preco;
        totalValue += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        
        const isDecimal = !Number.isInteger(item.qty) && item.qty % 1 !== 0;
        const qtyDisplay = isDecimal ? item.qty.toFixed(3).replace('.',',') + ' kg' : item.qty;

        div.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.product.nome}</h4>
                <p>${formatMoney(item.product.preco)} ${isDecimal ? 'p/ kg' : 'un.'}</p>
            </div>
            <div class="cart-item-actions">
                <button class="btn-icon" onclick="updateCartQty('${item.product.id}', -1)"><i class="fas fa-minus circle"></i></button>
                <span class="qty">${qtyDisplay}</span>
                <button class="btn-icon" onclick="updateCartQty('${item.product.id}', 1)"><i class="fas fa-plus circle"></i></button>
            </div>
            <div style="font-weight:600; min-width:80px; text-align:right">
                ${formatMoney(itemTotal)}
            </div>
        `;
        container.appendChild(div);
    });

    countEl.textContent = `${totalItens} itens`;
    subtotalEl.textContent = formatMoney(totalValue);
    totalEl.textContent = formatMoney(totalValue);
    checkoutBtn.disabled = false;
    clearBtn.disabled = false;
};

const checkoutModal = document.getElementById('checkout-modal');

// Checkout - Abre o Modal
document.getElementById('btn-checkout').addEventListener('click', () => {
    if (state.cart.length === 0) return;

    const total = state.cart.reduce((sum, item) => sum + (item.product.preco * item.qty), 0);
    document.getElementById('checkout-modal-total').textContent = formatMoney(total);
    checkoutModal.classList.add('active');
});

document.querySelector('.close-checkout').addEventListener('click', () => {
    checkoutModal.classList.remove('active');
});

// Finalizar ao escolher método
document.querySelectorAll('.btn-payment').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const method = e.currentTarget.dataset.method;
        if (method === 'DINHEIRO') {
            openCashPaymentModal();
        } else {
            await completeCheckout(method);
        }
    });
});

/* ===== Cash Payment Modal Logic ===== */
const cashModal = document.getElementById('cash-payment-modal');
const receivedInput = document.getElementById('cash-amount-received');
const changeContainer = document.getElementById('cash-change-container');
const changeValue = document.getElementById('cash-change-value');
const confirmCashBtn = document.getElementById('btn-confirm-cash');
let currentSaleTotal = 0;

const openCashPaymentModal = () => {
    checkoutModal.classList.remove('active');
    currentSaleTotal = state.cart.reduce((sum, item) => sum + (item.product.preco * item.qty), 0);
    document.getElementById('cash-modal-total').textContent = formatMoney(currentSaleTotal);
    
    receivedInput.value = '';
    changeContainer.style.display = 'none';
    confirmCashBtn.disabled = true;
    
    cashModal.classList.add('active');
    setTimeout(() => receivedInput.focus(), 100);
};

if (document.querySelector('.close-cash-modal')) {
    document.querySelector('.close-cash-modal').addEventListener('click', () => {
        cashModal.classList.remove('active');
        checkoutModal.classList.add('active'); // Voltar para modal de pagamento
    });
}

if (receivedInput) {
    receivedInput.addEventListener('input', (e) => {
        const received = parseFloat(e.target.value.replace(',','.'));
        if (!isNaN(received) && received >= currentSaleTotal) {
            const change = received - currentSaleTotal;
            changeValue.textContent = formatMoney(change);
            changeContainer.style.display = 'block';
            confirmCashBtn.disabled = false;
        } else {
            changeContainer.style.display = 'none';
            confirmCashBtn.disabled = true;
        }
    });

    receivedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !confirmCashBtn.disabled) {
            confirmCashBtn.click();
        }
    });
}

if (confirmCashBtn) {
    confirmCashBtn.addEventListener('click', async () => {
        const received = parseFloat(receivedInput.value.replace(',','.'));
        const change = received - currentSaleTotal;
        cashModal.classList.remove('active');
        await completeCheckout('DINHEIRO', received, change);
    });
}

const completeCheckout = async (method, valorPago = null, troco = null) => {
    if (state.cart.length === 0) return;

    checkoutModal.classList.remove('active'); // fecha o modal

    const checkoutBtn = document.getElementById('btn-checkout');
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

    const totalItens = state.cart.reduce((sum, item) => sum + (item.product.pesavel ? 1 : item.qty), 0);
    const total = state.cart.reduce((sum, item) => sum + (item.product.preco * item.qty), 0);
    const clienteNameRaw = document.getElementById('pos-customer-name')?.value.trim();
    const clienteName = normalizeName(clienteNameRaw);

    if (method === 'ENCOMENDA' && !clienteName) {
        showToast('Nome do cliente é obrigatório para encomendas.', 'error');
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Venda (F2)';
        return;
    }

    const customDateInput = document.getElementById('pos-custom-date');
    let saleDateISO = new Date().toISOString();
    if (customDateInput && customDateInput.value) {
        saleDateISO = new Date(customDateInput.value + 'T12:00:00').toISOString();
    }

    // Save Sale
    const sale = {
        data: saleDateISO,
        total,
        totalItens,
        cliente: clienteName || null,
        forma_pagamento: method,
        status: method === 'ENCOMENDA' ? 'ENCOMENDA' : 'CONCLUIDA',
        status_entrega: method === 'ENCOMENDA' ? 'PENDENTE' : 'ENTREGUE',
        data_conclusao: method === 'ENCOMENDA' ? null : saleDateISO,
        user_id: state.currentUser.id,
        itens: state.cart.map(item => ({
            id: item.product.id,
            PLU: item.product.PLU,
            nome: item.product.nome,
            preco: item.product.preco,
            custo: item.product.custo !== undefined ? item.product.custo : null,
            qty: item.qty
        }))
    };
    if (method === 'ENCOMENDA') {
        sale.valor_pago = 0;
    } else {
        if (valorPago !== null) sale.valor_pago = valorPago;
        else sale.valor_pago = total;
    }
    if (troco !== null) sale.troco = troco;

    try {
        const { data: saleData, error: saleError } = await _supabase.from('vendas').insert([sale]).select();
        if (saleError) throw saleError;

        const registeredSale = saleData && saleData.length > 0 ? saleData[0] : sale;

        // Deduct Stock and Record Movement (Only if NOT encomenda)
        if (method !== 'ENCOMENDA') {
            for (let cartItem of state.cart) {
                const product = state.products.find(p => p.id === cartItem.product.id);
                if (product && product.controlar_estoque !== false) {
                    const qtyVal = Number(cartItem.qty.toFixed(3));
                    const newStock = Number((product.estoque - qtyVal).toFixed(3));
                    const { error: stockError } = await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                    if (stockError) console.error("Erro ao atualizar estoque da venda:", stockError);
                    
                    // Registra a movimentação de saída vinculada à venda
                    const newMov = {
                        produto_id: product.id,
                        tipo: 'SAÍDA',
                        quantidade: qtyVal,
                        motivo: `Venda #${registeredSale.id}`,
                        user_id: state.currentUser.id
                    };
                    const { data: movData, error: movError } = await _supabase.from('movimentacoes').insert([newMov]).select();
                    if (movError) console.error("Erro ao inserir movimentação da venda:", movError);

                    if (movData && movData.length > 0) state.movimentacoes.push(movData[0]);

                    product.estoque = newStock;
                }
            }
        }

        state.sales.push(registeredSale);
        state.cart = [];

        
        // Limpar inputs de checkout
        const customerInput = document.getElementById('pos-customer-name');
        if (customerInput) customerInput.value = '';
        
        const customDateInputToClear = document.getElementById('pos-custom-date');
        if (customDateInputToClear) customDateInputToClear.value = '';

        renderCart();
        renderPosCatalog();
        
        
        showToast(method === 'ENCOMENDA' ? `Encomenda registrada com sucesso!` : `Venda ${registeredSale.id || ''} finalizada com sucesso!`, 'success');

        if (method !== 'ENCOMENDA') {
            state.pendingSaleForPrint = registeredSale;
            document.getElementById('print-confirm-modal').classList.add('active');
        }
        
    } catch (err) {
        showToast('Erro ao processar venda no banco.', 'error');
        console.error(err);
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Venda (F2)';
    }
};

const printReceipt = (sale) => {
    const printEl = document.getElementById('print-receipt');
    if (!printEl) return;
    
    let html = `
        <div class="print-header">
            <h1>${state.receiptConfig.storeName}</h1>
            <p>Data: ${formatDate(sale.data)}</p>
            <p>Recibo da Venda #${sale.id || 'N/A'}</p>
        </div>
        <div class="print-divider"></div>
        <div style="font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 5px;">
            <div style="display: flex; flex: 1;">
                <span style="min-width: 22px; display: inline-block;"></span>
                <span>Item</span>
            </div>
            <span>Total</span>
        </div>
    `;

    sale.itens.forEach((item, index) => {
        const itemTotal = item.qty * item.preco;
        const qtyDisplay = (item.qty % 1 !== 0) ? item.qty.toFixed(3).replace('.', ',') + 'kg' : item.qty + 'un';
        const itemNum = String(index + 1).padStart(2, '0');
        
        html += `
            <div class="print-item" style="display: flex; align-items: flex-start;">
                <span style="min-width: 22px; display: inline-block; text-align: left;">${itemNum}</span>
                <div class="print-item-col" style="flex: 1; text-align: left; padding-right: 5px;">
                    <span>${item.nome}</span>
                    <span style="font-size: 12px;">${qtyDisplay} x ${formatMoney(item.preco)}</span>
                </div>
                <div>${formatMoney(itemTotal)}</div>
            </div>
        `;
    });

    html += `
        <div class="print-divider"></div>
        <div class="print-total">TOTAL: ${formatMoney(Number(sale.total))}</div>
        <div style="text-align: right; font-size: 12px; margin-top: 3px;">Pgto: ${sale.forma_pagamento}</div>
    `;

    if (sale.forma_pagamento === 'DINHEIRO' && sale.valor_pago !== undefined && sale.troco !== undefined) {
        html += `
            <div style="text-align: right; font-size: 12px;">Recebido: ${formatMoney(Number(sale.valor_pago))}</div>
            <div style="text-align: right; font-size: 12px;">Troco: ${formatMoney(Number(sale.troco))}</div>
        `;
    }

    let footerMessage = state.receiptConfig.footerMsg;
    footerMessage = footerMessage.replace('{cliente}', '').replace(' ,', ',').replace('  ', ' ').trim();

    html += `
        <div class="print-footer">
            ${footerMessage}
            <div style="margin-top: 5px; font-size: 11px; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px;">*Cupom sem valor fiscal</div>
        </div>
    `;

    printEl.innerHTML = html;
    
    setTimeout(() => {
        window.print();
    }, 100);
};

// Atalhos Globais e Auto-Focus do PDV
document.addEventListener('keydown', (e) => {
    // Atalhos do Modal de Dinheiro
    if (document.getElementById('cash-payment-modal').classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            document.querySelector('.close-cash-modal').click();
        }
        return;
    }

    // Atalhos do Modal de Checkout
    if (document.getElementById('checkout-modal').classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            document.querySelector('.close-checkout').click();
            return;
        }
        if (e.key === '1') { e.preventDefault(); document.querySelector('.btn-payment[data-method="DINHEIRO"]').click(); return; }
        if (e.key === '2') { e.preventDefault(); document.querySelector('.btn-payment[data-method="PIX"]').click(); return; }
        if (e.key === '3') { e.preventDefault(); document.querySelector('.btn-payment[data-method="CARTÃO"]').click(); return; }
        if (e.key === '4') { e.preventDefault(); document.querySelector('.btn-payment[data-method="ENCOMENDA"]').click(); return; }
        return; // Não executa os atalhos de baixo se o modal estiver aberto
    }

    if (document.getElementById('screen-pos').classList.contains('active') && !document.querySelector('.modal.active')) {
        
        // Finalizar Venda
        if (e.key === 'F2') {
            e.preventDefault();
            document.getElementById('btn-checkout').click();
            return;
        }

        // Cancelar Venda
        if (e.key === 'F4') {
            e.preventDefault();
            document.getElementById('btn-clear-cart').click();
            return;
        }

        // Auto-focus para leitor de código de barras
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
        
        // Se não estiver digitando em nenhum input, e apertar uma tecla válida (como o bipe do leitor)
        if (!isInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            document.getElementById('pos-search').focus();
        }
    }
});

document.getElementById('btn-clear-cart').addEventListener('click', () => {
    if (confirm('Cancelar todos os itens da cesta?')) {
        state.cart = [];
        renderCart();
    }
});

/* ===== Modules: Checkout Scale (Web Serial API) ===== */
window.connectScale = async () => {
    try {
        if (state.scalePort) {
            showToast('Balança já conectada.', 'info');
            return;
        }

        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        state.scalePort = port;
        state.isScaleConnected = true;
        state.scaleKeepReading = true;
        
        showToast('Balança Ramuza conectada!', 'success');
        updateScaleUI(true);
        
        readScaleLoop();
        navigateTo('screen-pos'); 
    } catch (e) {
        console.error('Erro ao conectar balança:', e);
        showToast('Erro ao conectar balança (Cancelado ou sem permissão).', 'error');
    }
};

const updateScaleUI = (connected) => {
    const icon = document.getElementById('scale-icon');
    const display = document.getElementById('scale-weight-display');
    if (!icon || !display) return;
    
    if (connected) {
        icon.classList.remove('text-danger');
        icon.classList.add('text-success');
        display.style.color = 'var(--success-color)';
        
        // Updates labels screen if active
        if (document.getElementById('label-weight-active')) {
            document.getElementById('label-weight-active').style.display = 'block';
            document.getElementById('label-weight-manual').style.display = 'none';
        }
    } else {
        icon.classList.remove('text-success');
        icon.classList.add('text-danger');
        display.style.color = 'var(--text-secondary)';
        display.textContent = '-- kg';
        
        if (document.getElementById('label-weight-active')) {
            document.getElementById('label-weight-active').style.display = 'none';
            document.getElementById('label-weight-manual').style.display = 'block';
        }
    }
};

// Update live value in modal if it's open
const updateLiveModalValue = (weightStr) => {
    const liveVal = document.getElementById('weight-live-value');
    if (liveVal && document.getElementById('weight-capture-modal').classList.contains('active')) {
        liveVal.textContent = weightStr;
    }
};

const updateWeightState = (weight) => {
    state.currentScaleWeight = weight;
    const displayStr = weight.toFixed(3).replace('.', ',') + ' kg';
    const display = document.getElementById('scale-weight-display');
    if (display) display.textContent = displayStr;
    updateLiveModalValue(displayStr);
    
    // Updates label preview if it exists
    if (document.getElementById('label-live-value')) {
        document.getElementById('label-live-value').textContent = displayStr;
        if (typeof refreshLabelPreview === 'function') refreshLabelPreview();
    }
};

const readScaleLoop = async () => {
    while (state.scalePort && state.scaleKeepReading) {
        state.scaleReader = state.scalePort.readable.getReader();
        try {
            let buffer = '';
            while (true) {
                const { value, done } = await state.scaleReader.read();
                if (done) break;
                
                const chunk = new TextDecoder().decode(value);
                buffer += chunk;
                
                // Mantém buffer curto
                if (buffer.length > 150) buffer = buffer.slice(-150);
                
                // Print no console para diagnóstico caso o usuário precise
                // console.log("RAW SCALE:", buffer);

                // Estratégia 1: Padrão Toledo/Filizola STX (0x02) ... ETX (0x03)
                const stxIndex = buffer.lastIndexOf(String.fromCharCode(2));
                const etxIndex = buffer.lastIndexOf(String.fromCharCode(3));
                
                if (stxIndex !== -1 && etxIndex !== -1 && etxIndex > stxIndex) {
                    const packet = buffer.substring(stxIndex + 1, etxIndex);
                    const numStr = packet.replace(/[^0-9]/g, ''); // Extract only numbers
                    
                    if (numStr.length >= 4) {
                        const weight = parseInt(numStr, 10) / 1000;
                        updateWeightState(weight);
                        buffer = buffer.substring(etxIndex + 1);
                        continue;
                    }
                }

                // Estratégia 2: Ramuza / Genéricas que enviam números separados por Enter (\r ou \n)
                const lines = buffer.split(/[\r\n\x02\x03]+/);
                if (lines.length > 1) {
                    let parsed = false;
                    for (let i = lines.length - 2; i >= 0; i--) { // Pega a última linha completa
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        // Se for um decimal explícito ex: "0.085" ou "0,085"
                        if (line.includes('.') || line.includes(',')) {
                            const weight = parseFloat(line.replace(',', '.').replace(/[^0-9.]/g, ''));
                            if (!isNaN(weight)) {
                                updateWeightState(weight);
                                parsed = true;
                                break;
                            }
                        } else {
                            // Se for apenas dígitos ex: "00085"
                            const numStr = line.replace(/[^0-9]/g, '');
                            if (numStr.length >= 4 && numStr.length <= 6) {
                                const weight = parseInt(numStr, 10) / 1000;
                                updateWeightState(weight);
                                parsed = true;
                                break;
                            }
                        }
                    }
                    if (parsed) {
                        buffer = lines[lines.length - 1]; // Mantém só o restinho incompleto
                    }
                }
            }
        } catch (error) {
            console.error('Erro na leitura da balança:', error);
            state.isScaleConnected = false;
            state.scaleKeepReading = false;
            updateScaleUI(false);
        } finally {
            if (state.scaleReader) {
                try { state.scaleReader.releaseLock(); } catch(e) {}
            }
            if (state.scalePort) {
                try { await state.scalePort.close(); } catch(e) {}
            }
            state.scalePort = null;
        }
    }
};

let pendingWeightProduct = null;
window.cancelWeightCapture = () => {
    document.getElementById('weight-capture-modal').classList.remove('active');
    pendingWeightProduct = null;
    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
       searchInput.value = '';
       searchInput.focus();
    }
};

const confirmScaleWeight = () => {
    if (!pendingWeightProduct) return;
    
    let weight = 0;
    if (state.isScaleConnected) {
        weight = state.currentScaleWeight;
    } else {
        weight = parseFloat(document.getElementById('weight-manual-input').value.replace(',', '.'));
    }
    
    if (isNaN(weight) || weight <= 0) {
        showToast('Peso inválido.', 'error');
        return;
    }
    
    document.getElementById('weight-capture-modal').classList.remove('active');
    
    addToCart(pendingWeightProduct, weight, true);
    pendingWeightProduct = null;
    
    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
       searchInput.value = '';
       searchInput.focus();
    }
};

if (document.getElementById('btn-confirm-weight')) {
    document.getElementById('btn-confirm-weight').addEventListener('click', confirmScaleWeight);
}

document.getElementById('weight-manual-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmScaleWeight();
});

// Suporte para Enter no modal quando a balança estiver lendo automaticamente
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('weight-capture-modal');
    if (e.key === 'Enter' && modal && modal.classList.contains('active')) {
        // Se a balança estiver conectada (e o input manual escondido), o Enter confirma o peso vivo
        if (state.isScaleConnected) {
            e.preventDefault();
            confirmScaleWeight();
        }
    }
});


/* ===== Modules: Encomendas ===== */
let currentDeliveryOrderId = null;
const deliveryModal = document.getElementById('delivery-modal');

const renderOrders = async () => {
    // Refresh data
    await loadData();
    
    // Filtrar apenas encomendas (abertas)
    const searchClient = (document.getElementById('search-orders-client')?.value || '').trim().toLowerCase();
    const pendingOrders = state.sales.filter(s => {
        if (s.status !== 'ENCOMENDA') return false;
        if (searchClient && !(s.cliente || '').toLowerCase().includes(searchClient)) return false;
        return true;
    });
    
    // KPIs
    document.getElementById('kpi-orders-count').textContent = pendingOrders.length;
    const totalPending = pendingOrders.reduce((sum, s) => sum + (Number(s.total) - Number(s.valor_pago || 0)), 0);
    document.getElementById('kpi-orders-total').textContent = formatMoney(totalPending);
    
    // Itens mais encomendados
    const itemMap = {};
    pendingOrders.forEach(s => {
        s.itens.forEach(item => {
            const delivered = Number(item.delivered_qty || 0);
            const remaining = Number(item.qty) - delivered;
            if (remaining > 0) {
                itemMap[item.nome] = (itemMap[item.nome] || 0) + remaining;
            }
        });
    });
    const topItems = Object.entries(itemMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => {
            const qtyDisplay = (qty % 1 !== 0) ? qty.toFixed(3).replace('.', ',') : qty;
            return `<span class="badge badge-kpi">${name} (${qtyDisplay})</span>`;
        })
        .join(' ');
    
    document.getElementById('kpi-top-ordered-items').innerHTML = topItems || 'Nenhum item pendente';

    // Maiores devedores
    const debtorMap = {};
    const debtorPrettyNames = {}; // Para guardar a versão "bonita" do nome
    
    pendingOrders.forEach(s => {
        if (s.cliente) {
            const normalized = normalizeName(s.cliente);
            const remaining = Number(s.total) - Number(s.valor_pago || 0);
            debtorMap[normalized] = (debtorMap[normalized] || 0) + remaining;
            if (!debtorPrettyNames[normalized]) {
                debtorPrettyNames[normalized] = s.cliente;
            }
        }
    });
    const topDebtorsContainer = document.getElementById('top-debtors-list');
    const sortedDebtors = Object.entries(debtorMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
    
    if (sortedDebtors.length === 0) {
        topDebtorsContainer.innerHTML = '<p class="text-muted">Nenhum devedor registrado.</p>';
    } else {
        topDebtorsContainer.innerHTML = sortedDebtors.map(([normalized, amount]) => `
            <div class="debtor-card">
                <span class="name">${toTitleCase(debtorPrettyNames[normalized])}</span>
                <span class="amount">${formatMoney(amount)}</span>
            </div>
        `).join('');
    }

    // Separação em duas listas
    const pendingDeliveryOrders = pendingOrders.filter(s => s.status_entrega !== 'ENTREGUE');
    const deliveredOrders = pendingOrders.filter(s => s.status_entrega === 'ENTREGUE');

    const renderGroupedTable = (orders, tbodyId, emptyMsgId, togglePrefix) => {
        const tbody = document.getElementById(tbodyId);
        const emptyMsg = document.getElementById(emptyMsgId);
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (orders.length === 0) {
            emptyMsg.classList.remove('hidden');
            tbody.parentElement.classList.add('hidden');
        } else {
            emptyMsg.classList.add('hidden');
            tbody.parentElement.classList.remove('hidden');
            
            const groupedOrders = {};
            orders.forEach(s => {
                const clientName = s.cliente ? s.cliente.trim() : 'Sem Nome';
                const normalized = normalizeName(clientName);
                if (!groupedOrders[normalized]) {
                    groupedOrders[normalized] = {
                        clientName: clientName,
                        orders: [],
                        totalDebt: 0,
                        totalValue: 0,
                        totalPaid: 0,
                        pendingDeliveries: 0
                    };
                }
                groupedOrders[normalized].orders.push(s);
                const valPago = Number(s.valor_pago || 0);
                groupedOrders[normalized].totalValue += Number(s.total);
                groupedOrders[normalized].totalPaid += valPago;
                groupedOrders[normalized].totalDebt += (Number(s.total) - valPago);
                if (!s.status_entrega || s.status_entrega === 'PENDENTE' || s.status_entrega === 'PARCIAL') {
                    groupedOrders[normalized].pendingDeliveries++;
                }
            });

            Object.values(groupedOrders).sort((a,b) => b.totalDebt - a.totalDebt).forEach((group, index) => {
                const containerId = `${togglePrefix}-client-orders-${index}`;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td colspan="6" style="padding: 0; border-bottom: none;">
                        <div class="client-orders-header" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background: rgba(var(--primary-color-rgb), 0.05); cursor: pointer; border-bottom: 2px solid var(--border-color);" onclick="toggleClientOrders('${containerId}')">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <strong style="font-size: 1.1rem; color: var(--text-primary);">${toTitleCase(group.clientName)}</strong>
                                <span class="badge ${group.pendingDeliveries > 0 ? 'badge-warning' : 'badge-success'}">${group.orders.length} pedido(s)</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 2rem;">
                                <div style="text-align: right;">
                                    <strong class="text-danger" style="font-size: 1.1rem;">Falta: ${formatMoney(group.totalDebt)}</strong>
                                    <br><small class="text-muted">Total Encomendado: ${formatMoney(group.totalValue)}</small>
                                </div>
                                <i class="fas fa-chevron-down text-muted" id="icon-${containerId}"></i>
                            </div>
                        </div>
                        <div id="${containerId}" class="client-orders-content" style="display: none; padding: 1rem; background: rgba(0, 0, 0, 0.01);">
                            <table class="premium-table" style="background: var(--bg-color); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-radius: 8px;">
                                <tbody>
                                    ${group.orders.sort((a,b) => new Date(b.data) - new Date(a.data)).map(s => {
                                        const valPago = Number(s.valor_pago || 0);
                                        const restante = Number(s.total) - valPago;
                                        return `
                                            <tr>
                                                <td style="padding-left: 1.5rem;"><strong>#${s.id}</strong></td>
                                                <td><span class="text-muted">${formatDate(s.data)}</span></td>
                                                <td><strong>${formatMoney(Number(s.total))}</strong><br><small class="text-muted text-accent" style="font-weight: 500">${valPago > 0 ? `Pago: ${formatMoney(valPago)}<br>` : ''}Falta: ${formatMoney(restante)}</small></td>
                                                <td><span class="badge ${s.status_entrega === 'ENTREGUE' ? 'badge-success' : 'badge-warning'}">${s.status_entrega || 'PENDENTE'}</span></td>
                                                <td class="text-right" style="padding-right: 1.5rem;">
                                                    <button class="btn btn-ghost btn-small" onclick="viewSaleDetails('${s.id}')"><i class="fas fa-eye"></i> Detalhes</button>
                                                    ${(!s.status_entrega || s.status_entrega === 'PENDENTE') ? `<button class="btn btn-ghost btn-small text-danger" onclick="cancelOrder('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    };

    renderGroupedTable(pendingDeliveryOrders, 'orders-table-body', 'empty-orders-msg', 'pending');
    renderGroupedTable(deliveredOrders, 'delivered-orders-table-body', 'empty-delivered-orders-msg', 'delivered');
};

window.toggleClientOrders = (containerId) => {
    const el = document.getElementById(containerId);
    const icon = document.getElementById('icon-' + containerId);
    if (!el) return;
    if (el.style.display === 'none') {
        el.style.display = 'block';
        if(icon) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    } else {
        el.style.display = 'none';
        if(icon) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
};

window.markDelivered = async (orderId) => {
    if (!confirm('Deseja marcar TODOS os itens restantes como entregues e abater do estoque?')) return;
    
    const order = state.sales.find(s => String(s.id) === String(orderId));
    if (!order) return;

    try {
        const newItens = [...order.itens];
        
        for (let item of newItens) {
            const deliveredAlready = Number(item.delivered_qty || 0);
            const remainingToDeliver = Number(item.qty) - deliveredAlready;

            if (remainingToDeliver > 0) {
                const product = state.products.find(p => p.id === item.id || String(p.PLU) === String(item.PLU));
                if (product && product.controlar_estoque !== false) {
                    const qtyVal = Number(remainingToDeliver.toFixed(3));
                    const newStock = Number((product.estoque - qtyVal).toFixed(3));
                    
                    await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                    
                    await _supabase.from('movimentacoes').insert([{
                        produto_id: product.id,
                        tipo: 'SAÍDA',
                        quantidade: qtyVal,
                        motivo: `Entrega Encomenda #${order.id}`,
                        user_id: state.currentUser.id
                    }]);
                    
                    product.estoque = newStock;
                }
                item.delivered_qty = Number(item.qty); // Fully delivered
            }
        }

        let newStatus = 'ENCOMENDA';
        let dataConclusao = null;
        if (Number(order.valor_pago || 0) >= Number(order.total)) {
            newStatus = 'CONCLUIDA';
            dataConclusao = new Date().toISOString();
        }

        const updateData = { status_entrega: 'ENTREGUE', status: newStatus, itens: newItens };
        if (dataConclusao) updateData.data_conclusao = dataConclusao;
        
        await _supabase.from('vendas').update(updateData).eq('id', orderId);

        showToast('Encomenda totalmente entregue!', 'success');
        if (typeof saleDetailsModal !== 'undefined') saleDetailsModal.classList.remove('active');
        await loadData(); 
        await renderOrders();
    } catch (err) {
        showToast('Erro ao entregar.', 'error');
        console.error(err);
    }
};

window.openPartialDeliveryModal = (orderId) => {
    const order = state.sales.find(s => String(s.id) === String(orderId));
    if (!order) return;
    
    currentDeliveryOrderId = orderId;
    document.getElementById('partial-delivery-order-id').textContent = orderId;
    
    const tbody = document.getElementById('partial-delivery-items-body');
    tbody.innerHTML = '';
    
    order.itens.forEach((item, index) => {
        const deliveredAlready = Number(item.delivered_qty || 0);
        const remainingToDeliver = Number(item.qty) - deliveredAlready;
        
        if (remainingToDeliver <= 0) return; // Only show items that still need delivery
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.nome}</strong><br><small class="text-muted">#${item.PLU}</small></td>
            <td class="text-center"><span class="badge badge-warning">${remainingToDeliver} un.</span></td>
            <td>
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.25rem; background: var(--bg-color); padding: 0.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <button type="button" class="btn-icon text-muted" style="width: 32px; height: 32px; font-size: 0.9rem;" onclick="modifyPartialQty('partial-input-${index}', -1)"><i class="fas fa-minus"></i></button>
                    <input type="number" step="0.001" min="0" max="${remainingToDeliver}" id="partial-input-${index}" class="input form-control partial-qty-input" data-index="${index}" style="width: 65px; text-align: center; margin: 0; padding: 0.5rem; border: none; box-shadow: none; font-weight: bold; background: transparent; color: var(--text-primary);" value="0">
                    <button type="button" class="btn-icon text-primary" style="width: 32px; height: 32px; font-size: 0.9rem;" onclick="modifyPartialQty('partial-input-${index}', 1)"><i class="fas fa-plus"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('partial-delivery-modal').classList.add('active');
};

window.modifyPartialQty = (inputId, delta) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    let current = parseFloat(input.value) || 0;
    let newValue = current + delta;
    const max = parseFloat(input.getAttribute('max')) || Infinity;
    const min = parseFloat(input.getAttribute('min')) || 0;
    if (newValue > max) newValue = max;
    if (newValue < min) newValue = min;
    input.value = Number(newValue.toFixed(3));
};

document.querySelectorAll('.close-partial-delivery').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('partial-delivery-modal').classList.remove('active');
    });
});

document.getElementById('btn-confirm-partial-delivery')?.addEventListener('click', async () => {
    if (!currentDeliveryOrderId) return;
    const order = state.sales.find(s => String(s.id) === String(currentDeliveryOrderId));
    if (!order) return;

    try {
        const inputs = document.querySelectorAll('.partial-qty-input');
        const newItens = [...order.itens];
        let itemsDeliveredNow = 0;
        
        for (let input of inputs) {
            const index = input.dataset.index;
            const toDeliver = parseFloat(input.value) || 0;
            if (toDeliver > 0) {
                const item = newItens[index];
                const product = state.products.find(p => p.id === item.id || String(p.PLU) === String(item.PLU));
                
                if (product && product.controlar_estoque !== false) {
                    const qtyVal = Number(toDeliver.toFixed(3));
                    const newStock = Number((product.estoque - qtyVal).toFixed(3));
                    await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                    await _supabase.from('movimentacoes').insert([{
                        produto_id: product.id, tipo: 'SAÍDA', quantidade: qtyVal, motivo: `Entrega Parcial #${order.id}`, user_id: state.currentUser.id
                    }]);
                    product.estoque = newStock;
                }
                
                item.delivered_qty = Number(item.delivered_qty || 0) + toDeliver;
                itemsDeliveredNow++;
            }
        }
        
        if (itemsDeliveredNow === 0) {
            showToast('Nenhuma quantidade preenchida para entrega.', 'warning');
            return;
        }

        const completelyDelivered = newItens.every(item => Number(item.delivered_qty || 0) >= Number(item.qty));
        
        let newStatusEntrega = completelyDelivered ? 'ENTREGUE' : 'PARCIAL';
        let newStatus = 'ENCOMENDA';
        let dataConclusao = null;
        
        if (completelyDelivered && Number(order.valor_pago || 0) >= Number(order.total)) {
            newStatus = 'CONCLUIDA';
            dataConclusao = new Date().toISOString();
        }

        const updateData = { status_entrega: newStatusEntrega, status: newStatus, itens: newItens };
        if (dataConclusao) updateData.data_conclusao = dataConclusao;
        
        await _supabase.from('vendas').update(updateData).eq('id', order.id);

        showToast('Entrega parcial registrada!', 'success');
        document.getElementById('partial-delivery-modal').classList.remove('active');
        if (typeof saleDetailsModal !== 'undefined') saleDetailsModal.classList.remove('active');
        await loadData(); 
        await renderOrders();
    } catch (err) {
        showToast('Erro ao entregar.', 'error');
        console.error(err);
    }
});

window.openPaymentModal = (orderId) => {
    const order = state.sales.find(s => String(s.id) === String(orderId));
    if (!order) return;
    
    currentDeliveryOrderId = orderId;
    const valPago = Number(order.valor_pago || 0);
    const restante = Number(order.total) - valPago;
    
    document.getElementById('payment-modal-remaining').textContent = formatMoney(restante);
    document.getElementById('payment-amount').value = restante.toFixed(2);
    document.getElementById('payment-modal').classList.add('active');
};

document.querySelector('.close-payment')?.addEventListener('click', () => {
    document.getElementById('payment-modal').classList.remove('active');
});

document.querySelectorAll('.btn-payment-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        if (!currentDeliveryOrderId) return;
        const method = e.currentTarget.dataset.method;
        const inputVal = parseFloat(document.getElementById('payment-amount').value);
        if (isNaN(inputVal) || inputVal <= 0) {
            showToast('Valor inválido', 'error');
            return;
        }
        
        const order = state.sales.find(s => String(s.id) === String(currentDeliveryOrderId));
        if (!order) return;
        
        const currentPago = Number(order.valor_pago || 0);
        const newTotalPago = currentPago + inputVal;
        
        try {
            let newStatus = 'ENCOMENDA';
            let dataConclusao = null;
            if (newTotalPago >= Number(order.total) && order.status_entrega === 'ENTREGUE') {
                newStatus = 'CONCLUIDA';
                dataConclusao = new Date().toISOString();
            }

            const updateData = { 
                valor_pago: newTotalPago, 
                forma_pagamento: method,
                status: newStatus
            };
            if (dataConclusao) updateData.data_conclusao = dataConclusao;
            
            await _supabase.from('vendas').update(updateData).eq('id', order.id);
            
            showToast('Pagamento registrado!', 'success');
            document.getElementById('payment-modal').classList.remove('active');
            if (typeof saleDetailsModal !== 'undefined') saleDetailsModal.classList.remove('active');
            
            // Reload global data because reports might need this concluded sale!
            await loadData();
            await renderOrders();
        } catch (err) {
            showToast('Erro ao receber.', 'error');
            console.error(err);
        }
    });
});


window.cancelOrder = async (orderId) => {
    if (confirm('Deseja realmente cancelar esta encomenda? (A ação não pode ser desfeita)')) {
        try {
            const { error } = await _supabase.from('vendas').delete().eq('id', orderId);
            if (error) throw error;
            
            showToast('Encomenda cancelada.', 'info');
            await renderOrders();
        } catch (err) {
            showToast('Erro ao cancelar encomenda.', 'error');
            console.error(err);
        }
    }
};

/* ===== Modules: Reports ===== */
const saleDetailsModal = document.getElementById('sale-details-modal');

document.getElementById('btn-filter-reports').addEventListener('click', () => {
    renderReports();
});

document.getElementById('filter-report-client')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') renderReports();
});

let debounceOrdersTimer;
document.getElementById('search-orders-client')?.addEventListener('input', () => {
    clearTimeout(debounceOrdersTimer);
    debounceOrdersTimer = setTimeout(() => {
        renderOrders();
    }, 600);
});

const renderReports = async (resetPage = true) => {
    if (resetPage) state.currentReportPage = 1;

    const startInput = document.getElementById('filter-date-start').value;
    const endInput = document.getElementById('filter-date-end').value;
    const searchClient = (document.getElementById('filter-report-client')?.value || '').trim().toLowerCase();
    
    // Refresh to get latest DB changes
    await loadData();
    // Vendas CONCLUIDAS e CANCELADAS aparecem no relatório de vendas
    let filteredSales = state.sales.filter(s => s.status === 'CONCLUIDA' || s.status === 'CANCELADA');
    
    if (searchClient) {
        filteredSales = filteredSales.filter(s => (s.cliente || '').toLowerCase().includes(searchClient));
    }
    
    if (startInput || endInput) {
        const startDate = startInput ? new Date(startInput + 'T00:00:00') : new Date('2000-01-01');
        const endDate = endInput ? new Date(endInput + 'T23:59:59') : new Date('2100-01-01');
        
        filteredSales = filteredSales.filter(s => {
            // Usa data de conclusão para o relatório, ou data normal se nao hover conclusao (vendas diretas)
            const saleDate = new Date(s.data_conclusao || s.data);
            return saleDate >= startDate && saleDate <= endDate;
        });
    }

    // KPIs consideram apenas vendas efetivadas (CONCLUIDA)
    const concludedSales = filteredSales.filter(s => s.status === 'CONCLUIDA');
    const totalSalesNum = concludedSales.length;
    const revenue = concludedSales.reduce((sum, s) => sum + Number(s.total), 0);
    const avgTicket = totalSalesNum > 0 ? revenue / totalSalesNum : 0;

    document.getElementById('kpi-total-sales').textContent = totalSalesNum;
    document.getElementById('kpi-total-revenue').textContent = formatMoney(revenue);
    document.getElementById('kpi-avg-ticket').textContent = formatMoney(avgTicket);

    const tbody = document.getElementById('sales-table-body');
    const emptyMsg = document.getElementById('empty-sales-msg');
    const paginationContainer = document.getElementById('reports-pagination');
    tbody.innerHTML = '';
    
    if (filteredSales.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
        paginationContainer.innerHTML = '';
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        
        // Ordenar: mais novo primeiro
        const sortedSales = filteredSales.sort((a,b) => new Date(b.data) - new Date(a.data));
        
        // Paginacao: 10 por pagina
        const itemsPerPage = 10;
        const totalPages = Math.ceil(sortedSales.length / itemsPerPage);
        const startIdx = (state.currentReportPage - 1) * itemsPerPage;
        const pageItems = sortedSales.slice(startIdx, startIdx + itemsPerPage);

        pageItems.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${s.id}</strong></td>
                <td><span class="text-muted"><i class="far fa-clock"></i> ${formatDate(s.data)}</span></td>
                <td>${s.cliente || '-'}</td>
                <td>
                    <span class="badge ${s.status === 'CANCELADA' ? 'badge-danger' : (s.forma_pagamento === 'PIX' ? 'badge-success' : s.forma_pagamento === 'CARTÃO' ? 'badge-info' : 'badge-warning')}">
                        ${s.status === 'CANCELADA' ? 'CANCELADA' : s.forma_pagamento}
                    </span>
                </td>
                <td><strong>${formatMoney(Number(s.total))}</strong></td>
                <td class="text-right">
                    <button class="btn btn-ghost btn-small" onclick="viewSaleDetails('${s.id}')"><i class="fas fa-eye"></i> Detalhes</button>
                    ${s.status !== 'CANCELADA' ? `<button class="btn btn-ghost btn-small text-danger" onclick="cancelSale('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });

        renderReportPagination(totalPages);
    }
};

const renderReportPagination = (totalPages) => {
    const container = document.getElementById('reports-pagination');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <button class="pagination-btn" ${state.currentReportPage === 1 ? 'disabled' : ''} onclick="changeReportPage(${state.currentReportPage - 1})">
            <i class="fas fa-chevron-left"></i> Prev
        </button>
        <div class="pagination-numbers">
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button class="pagination-btn ${i === state.currentReportPage ? 'active' : ''}" onclick="changeReportPage(${i})">
                ${i}
            </button>
        `;
    }

    html += `
        </div>
        <button class="pagination-btn" ${state.currentReportPage === totalPages ? 'disabled' : ''} onclick="changeReportPage(${state.currentReportPage + 1})">
            Next <i class="fas fa-chevron-right"></i>
        </button>
    `;

    container.innerHTML = html;
};

window.changeReportPage = (page) => {
    state.currentReportPage = page;
    renderReports(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.viewSaleDetails = (saleId) => {
    const sale = state.sales.find(s => String(s.id) === String(saleId));
    if (!sale) return;

    document.getElementById('detail-sale-id').textContent = `#${sale.id}`;
    document.getElementById('detail-sale-date').textContent = formatDate(sale.data);
    document.getElementById('detail-sale-customer').textContent = sale.cliente || 'Não Informado';
    document.getElementById('detail-sale-payment').textContent = sale.status === 'CANCELADA' ? 'CANCELADA' : sale.forma_pagamento;
    const badgesHtml = sale.status === 'ENCOMENDA' ? `<span class="badge ${sale.status_entrega==='ENTREGUE'?'badge-success':'badge-warning'}">${sale.status_entrega||'PENDENTE'}</span> <span class="badge badge-danger" style="background: rgba(var(--danger-color-rgb), 0.15); color: var(--danger-color); border: 1px solid rgba(var(--danger-color-rgb), 0.3);">Falta ${formatMoney(Number(sale.total) - Number(sale.valor_pago||0))}</span>` : '';
    document.getElementById('detail-sale-badges').innerHTML = badgesHtml;
    
    const cashInfo = document.getElementById('detail-sale-cash-info');
    if (sale.forma_pagamento === 'DINHEIRO' && sale.valor_pago !== undefined && sale.valor_pago !== null && sale.troco !== undefined && sale.troco !== null && sale.status !== 'ENCOMENDA') {
        document.getElementById('detail-sale-received').textContent = formatMoney(Number(sale.valor_pago));
        document.getElementById('detail-sale-change').textContent = formatMoney(Number(sale.troco));
        cashInfo.style.display = 'inline';
    } else {
        cashInfo.style.display = 'none';
    }

    document.getElementById('detail-sale-total').textContent = formatMoney(Number(sale.total));

    const tbody = document.getElementById('sale-items-body');
    tbody.innerHTML = '';

    sale.itens.forEach(item => {
        const subtotal = item.qty * item.preco;
        const delivered = item.delivered_qty || 0;
        const remaining = item.qty - delivered;
        const progressHtml = sale.status === 'ENCOMENDA' ? `<br><small class="${remaining <= 0 ? 'text-success' : 'text-warning'}">Entregue: ${delivered} / ${item.qty}</small>` : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.nome}</strong><br><small class="text-muted">#${item.PLU}</small></td>
            <td>${formatMoney(item.preco)}</td>
            <td>${item.qty} un.${progressHtml}</td>
            <td class="text-right font-weight-bold">${formatMoney(subtotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    const btnCancel = document.getElementById('btn-cancel-sale');
    const btnDeliver = document.getElementById('btn-deliver-order');
    const btnPay = document.getElementById('btn-pay-order');
    
    if (btnCancel) {
        if (sale.status === 'CANCELADA' || sale.status === 'ENCOMENDA') {
            btnCancel.style.display = 'none';
        } else {
            btnCancel.style.display = 'flex';
            btnCancel.dataset.id = sale.id;
        }
    }

    const btnDeliverPartial = document.getElementById('btn-deliver-partial');
    
    if (btnDeliver) {
        if (sale.status === 'ENCOMENDA' && (!sale.status_entrega || sale.status_entrega === 'PENDENTE' || sale.status_entrega === 'PARCIAL')) {
            btnDeliver.style.display = 'flex';
            btnDeliver.dataset.id = sale.id;
        } else {
            btnDeliver.style.display = 'none';
        }
    }

    if (btnDeliverPartial) {
        if (sale.status === 'ENCOMENDA' && (!sale.status_entrega || sale.status_entrega === 'PENDENTE' || sale.status_entrega === 'PARCIAL')) {
            btnDeliverPartial.style.display = 'flex';
            btnDeliverPartial.dataset.id = sale.id;
        } else {
            btnDeliverPartial.style.display = 'none';
        }
    }

    if (btnPay) {
        if (sale.status === 'ENCOMENDA' && Number(sale.valor_pago || 0) < Number(sale.total)) {
            btnPay.style.display = 'flex';
            btnPay.dataset.id = sale.id;
        } else {
            btnPay.style.display = 'none';
        }
    }

    saleDetailsModal.classList.add('active');
};

window.cancelSale = async (saleId) => {
    if (!confirm('Deseja realmente CANCELAR esta venda? O estoque será devolvido automaticamente.')) return;

    try {
        const sale = state.sales.find(s => String(s.id) === String(saleId));
        if (!sale) return;

        showToast('Cancelando venda...', 'info');

        // 1. Marcar venda como cancelada
        const { error: saleError } = await _supabase
            .from('vendas')
            .update({ status: 'CANCELADA' })
            .eq('id', saleId);

        if (saleError) throw saleError;

        // 2. Devolver estoque e registrar movimentação
        for (const item of sale.itens) {
            const product = state.products.find(p => p.PLU === item.PLU);
            if (product && product.controlar_estoque) {
                const newStock = Number(product.estoque) + Number(item.qty);
                
                // Atualizar estoque
                await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                
                // Registrar movimento de entrada (estorno)
                await _supabase.from('movimentacoes').insert({
                    produto_id: product.id,
                    tipo: 'ENTRADA',
                    quantidade: item.qty,
                    motivo: `ESTORNO (VENDA #${saleId} CANCELADA)`,
                    user_id: state.currentUser.id
                });
            }
        }

        showToast('Venda cancelada e estoque devolvido!', 'success');
        saleDetailsModal.classList.remove('active');
        await loadData();
        renderReports();
    } catch (error) {
        console.error('Erro ao cancelar venda:', error);
        showToast('Erro ao cancelar venda.', 'error');
    }
};

document.getElementById('btn-cancel-sale')?.addEventListener('click', (e) => {
    const saleId = e.currentTarget.dataset.id;
    if (saleId) cancelSale(saleId);
});

document.getElementById('btn-deliver-order')?.addEventListener('click', (e) => {
    const saleId = e.currentTarget.dataset.id;
    if (saleId) markDelivered(saleId);
});

document.getElementById('btn-deliver-partial')?.addEventListener('click', (e) => {
    const saleId = e.currentTarget.dataset.id;
    if (saleId) openPartialDeliveryModal(saleId);
});

document.getElementById('btn-pay-order')?.addEventListener('click', (e) => {
    const saleId = e.currentTarget.dataset.id;
    if (saleId) openPaymentModal(saleId);
});

const receiptConfigModal = document.getElementById('receipt-config-modal');

window.openReceiptConfigModal = () => {
    document.getElementById('receipt-store-name').value = state.receiptConfig.storeName;
    document.getElementById('receipt-footer-msg').value = state.receiptConfig.footerMsg;
    receiptConfigModal.classList.add('active');
};

document.getElementById('receipt-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newConfig = {
        id: 1,
        nome_loja: document.getElementById('receipt-store-name').value,
        rodape_recibo: document.getElementById('receipt-footer-msg').value,
        updated_at: new Date().toISOString()
    };
    
    try {
        const { error } = await _supabase.from('store_configs').upsert(newConfig);
        if (error) throw error;
        
        state.receiptConfig.storeName = newConfig.nome_loja;
        state.receiptConfig.footerMsg = newConfig.rodape_recibo;
        
        receiptConfigModal.classList.remove('active');
        showToast('Configuração global do recibo atualizada!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar configuração global.', 'error');
    }
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        saleDetailsModal.classList.remove('active');
        productModal.classList.remove('active');
        if (receiptConfigModal) receiptConfigModal.classList.remove('active');
        if(document.getElementById('product-form')) {
           document.getElementById('product-form').reset();
           document.getElementById('prod-id').value = '';
        }
    });
});

/* ===== Modules: Inventory (Stock) ===== */
const movementModal = document.getElementById('movement-modal');

const renderStockHistory = () => {
    const tbody = document.getElementById('stock-table-body');
    const emptyMsg = document.getElementById('empty-stock-msg');
    tbody.innerHTML = '';
    
    if (state.movimentacoes.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        
        const sortedMovs = [...state.movimentacoes].sort((a,b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao));
        
        sortedMovs.forEach(m => {
            const product = state.products.find(p => String(p.id) === String(m.produto_id));
            const tr = document.createElement('tr');
            const typeClass = m.tipo === 'ENTRADA' ? 'text-success' : 'text-danger';
            const typeIcon = m.tipo === 'ENTRADA' ? 'fa-arrow-up' : 'fa-arrow-down';
            
            const isPesavel = product && product.pesavel;
            const qtdStr = isPesavel ? parseFloat(m.quantidade).toFixed(3).replace('.',',') + ' kg' : m.quantidade + ' un.';

            tr.innerHTML = `
                <td><span class="text-muted"><i class="far fa-clock"></i> ${formatDate(m.data_movimentacao)}</span></td>
                <td><strong>${product ? product.nome : 'Produto Removido (' + m.produto_id + ')'}</strong></td>
                <td><span class="${typeClass} font-weight-bold"><i class="fas ${typeIcon}"></i> ${m.tipo}</span></td>
                <td>${qtdStr}</td>
                <td><span class="text-muted">${m.motivo || '-'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
};

document.getElementById('btn-new-movement').addEventListener('click', () => {
    const select = document.getElementById('mov-product');
    select.innerHTML = '<option value="" disabled selected>Selecione um produto</option>';
    state.products.filter(p => p.controlar_estoque !== false).forEach(p => {
        const estStr = p.pesavel ? parseFloat(p.estoque).toFixed(3).replace('.',',') + ' kg' : p.estoque + ' un.';
        select.innerHTML += `<option value="${p.id}">${p.nome} (Atual: ${estStr})</option>`;
    });
    movementModal.classList.add('active');
});

document.querySelectorAll('#movement-modal .close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        movementModal.classList.remove('active');
        document.getElementById('movement-form').reset();
    });
});

document.getElementById('movement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const produto_id = document.getElementById('mov-product').value;
    const tipo = document.getElementById('mov-type').value;
    const quantidade = parseFloat(document.getElementById('mov-qty').value) || 0;
    const motivo = document.getElementById('mov-reason').value.trim();

    if(!produto_id) {
        showToast('Selecione um produto.', 'error');
        return;
    }

    const product = state.products.find(p => String(p.id) === String(produto_id));
    if(!product) return;

    let newStock = product.estoque;
    if (tipo === 'ENTRADA') newStock += quantidade;
    if (tipo === 'SAÍDA') newStock -= quantidade;

    if (newStock < 0) {
        showToast('Estoque não pode ficar negativo.', 'error');
        return;
    }

    const newMov = {
        produto_id: parseInt(produto_id),
        tipo,
        quantidade,
        motivo,
        user_id: state.currentUser.id
    };

    try {
        const { data: movData, error: movError } = await _supabase.from('movimentacoes').insert([newMov]).select();
        if (movError) throw movError;

        const { error: stockError } = await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
        if (stockError) throw stockError;

        product.estoque = newStock;
        
        if (movData && movData.length > 0) {
            state.movimentacoes.push(movData[0]);
        }
        
        movementModal.classList.remove('active');
        e.target.reset();
        renderStockHistory();
        showToast('Movimentação registrada com sucesso!', 'success');
        
    } catch (err) {
        showToast('Erro ao salvar movimentação.', 'error');
        console.error(err);
    }
});

/* ===== Configurações / Balança ====== */
const scaleModal = document.getElementById('scale-config-modal');

window.openScaleConfigModal = () => {
    if (state.scaleConfig) {
        document.getElementById('scale-prefix-len').value = state.scaleConfig.prefix_length;
        document.getElementById('scale-plu-len').value = state.scaleConfig.plu_length;
        document.getElementById('scale-val-len').value = state.scaleConfig.value_length;
        document.getElementById('scale-val-type').value = state.scaleConfig.value_type;
    }
    
    // trigger preview update
    document.getElementById('scale-val-len').dispatchEvent(new Event('input'));
    scaleModal.classList.add('active');
};

document.getElementById('scale-val-len')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('scale-format-preview').textContent = val;
});

document.querySelectorAll('#scale-config-modal .close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        scaleModal.classList.remove('active');
    });
});

document.getElementById('scale-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const config = {
        id: 1, // ID global
        prefix_length: parseInt(document.getElementById('scale-prefix-len').value),
        plu_length: parseInt(document.getElementById('scale-plu-len').value),
        value_length: parseInt(document.getElementById('scale-val-len').value),
        value_type: document.getElementById('scale-val-type').value
    };

    try {
        const { error } = await _supabase.from('scale_configs').upsert(config);
        if (error) throw error;
        state.scaleConfig = config;
        showToast('Configuração global da balança salva!', 'success');
        scaleModal.classList.remove('active');
    } catch(err) {
        console.error(err);
        showToast('Erro ao salvar configurações globais.', 'error');
    }
});


/* ===== Print Confirm Modal Logic ===== */
const printConfirmModal = document.getElementById('print-confirm-modal');
const btnPrintYes = document.getElementById('btn-print-yes');
const btnPrintNo = document.getElementById('btn-print-no');

const handlePrintDecision = (print) => {
    if (!printConfirmModal || !printConfirmModal.classList.contains('active')) return;
    
    printConfirmModal.classList.remove('active');
    if (print && state.pendingSaleForPrint) {
        printReceipt(state.pendingSaleForPrint);
    }
    state.pendingSaleForPrint = null;
};

if (btnPrintYes) btnPrintYes.addEventListener('click', () => handlePrintDecision(true));
if (btnPrintNo) btnPrintNo.addEventListener('click', () => handlePrintDecision(false));

document.addEventListener('keydown', (e) => {
    if (printConfirmModal && printConfirmModal.classList.contains('active')) {
        if (e.key === '1') {
            e.preventDefault();
            handlePrintDecision(true);
        } else if (e.key === '0') {
            e.preventDefault();
            handlePrintDecision(false);
        }
    }
});

/* ===== Modules: Importer (Excel/CSV) ===== */
let importList = [];
let currentImportIndex = 0;

window.openImporterModal = function() {
    const modal = document.getElementById('importer-modal');
    document.getElementById('import-upload-state').style.display = 'block';
    document.getElementById('import-review-state').style.display = 'none';
    document.getElementById('import-progress').textContent = '0/0';
    document.getElementById('import-file').value = '';
    modal.classList.add('active');
};

window.handleImportFile = async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON (header: 1 means array of arrays)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Ignore empty rows and first row (header)
        importList = rows.filter(r => r.length > 0).slice(1).map(row => {
            return {
                plu: row[0] ? String(row[0]).trim() : '',
                quantidade: row[1] ? Number(row[1]) || 0 : 0,
                nome: row[2] ? String(row[2]).trim() : '',
                custo: row[3] ? Number(row[3]) || 0 : 0,
                preco: row[4] ? Number(row[4]) || 0 : 0,
                referencia: row[5] ? String(row[5]).trim() : '',
                pesavel: row[6],
                controlar_estoque: row[7]
            };
        }).filter(r => r.plu || r.nome); // ignore completely empty mapped rows

        if (importList.length === 0) {
            showToast('Nenhum produto válido encontrado na planilha.', 'error');
            return;
        }

        currentImportIndex = 0;
        document.getElementById('import-upload-state').style.display = 'none';
        document.getElementById('import-review-state').style.display = 'block';
        renderNextImportItem();
    } catch (error) {
        console.error(error);
        showToast('Erro ao ler a planilha. Formato inválido?', 'error');
    }
};

window.renderNextImportItem = function() {
    if (currentImportIndex >= importList.length) {
        showToast('Importação concluída com sucesso!', 'success');
        document.getElementById('importer-modal').classList.remove('active');
        loadData().then(() => {
            renderProducts();
            updateKPIs();
        });
        return;
    }

    document.getElementById('import-progress').textContent = `${currentImportIndex + 1}/${importList.length}`;
    
    const item = importList[currentImportIndex];
    document.getElementById('import-plu').value = item.plu;
    document.getElementById('import-estoque').value = item.quantidade;
    document.getElementById('import-nome').value = item.nome;
    document.getElementById('import-custo').value = formatMoney(item.custo).replace('R$ ', '');
    document.getElementById('import-preco').value = formatMoney(item.preco).replace('R$ ', '');
    document.getElementById('import-referencia').value = item.referencia;
    
    // Pesavel: default 0 (desligado) unless explicitly 1 or "sim"
    const pStr = String(item.pesavel).toLowerCase().trim();
    document.getElementById('import-pesavel').checked = (pStr === '1' || pStr === 'sim' || pStr === 'true');

    // Controlar estoque: default 1 (ligado) unless explicitly 0 or "nao"
    if (item.controlar_estoque === undefined || item.controlar_estoque === null || item.controlar_estoque === '') {
        document.getElementById('import-controlar-estoque').checked = true;
    } else {
        const cStr = String(item.controlar_estoque).toLowerCase().trim();
        document.getElementById('import-controlar-estoque').checked = (cStr !== '0' && cStr !== 'nao' && cStr !== 'false');
    }
};

window.skipCurrentImportItem = function() {
    currentImportIndex++;
    renderNextImportItem();
};

window.saveCurrentImportItem = async function() {
    const plu = document.getElementById('import-plu').value.trim();
    const nome = document.getElementById('import-nome').value.trim();
    const referencia = document.getElementById('import-referencia').value.trim();
    const estoque = parseFloat(document.getElementById('import-estoque').value);
    const custo = parseFloat(document.getElementById('import-custo').value.replace(/[^0-9,]/g, '').replace(',', '.') || 0);
    const preco = parseFloat(document.getElementById('import-preco').value.replace(/[^0-9,]/g, '').replace(',', '.') || 0);
    const controlar_estoque = document.getElementById('import-controlar-estoque').checked;
    const pesavel = document.getElementById('import-pesavel').checked;

    if (!plu || !nome) {
        showToast('PLU e Nome são obrigatórios.', 'error');
        return;
    }
    
    if (isNaN(estoque)) {
        showToast('A quantidade em estoque é obrigatória.', 'error');
        return;
    }

    try {
        const productData = {
            PLU: plu,
            nome,
            estoque,
            custo,
            preco,
            referencia,
            controlar_estoque,
            pesavel,
            permitir_estoque_negativo: false
        };

        const { error } = await _supabase.from('produtos').insert([productData]);
        if (error) {
            if (error.message && error.message.toLowerCase().includes('unique')) {
                showToast(`Cód. Barras ${plu} já cadastrado no sistema! Pule ou altere o código.`, 'error');
                return;
            }
            throw new Error(error.message);
        }

        showToast(`Produto "${nome}" cadastrado com sucesso!`, 'success');

        currentImportIndex++;
        renderNextImportItem();
    } catch (e) {
        console.error(e);
        showToast('Erro ao salvar produto.', 'error');
    }
};

/* ===== App Initialization ===== */
// Start App
(async () => {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (!session || error) {
        window.location.href = 'index.html';
        return;
    }
    
    state.currentUser = session.user;

    // Buscar Role do Usuário
    const { data: roleData } = await _supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
    if (roleData) {
        state.userRole = roleData.role;
    }

    const userEmail = session.user.email;
    const displayName = state.userRole === 'admin' ? `${userEmail} (Admin)` : `${userEmail} (Caixa)`;
    app.usernameDisplay.textContent = displayName.length > 22 ? displayName.substring(0, 22) + '...' : displayName;
    app.usernameDisplay.title = displayName;

    // Mostrar menu de configurações para todos (Global)
    const navSettings = document.getElementById('nav-settings');
    if (navSettings) navSettings.style.display = 'block';

    await loadData();
    navigateTo('screen-pos');
})();
/* ===== Modules: Label Generator ===== */
let selectedLabelProduct = null;

document.getElementById('label-product-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const resultsUl = document.getElementById('label-product-results');
    resultsUl.innerHTML = '';
    
    if (!term) {
        resultsUl.classList.add('hidden');
        return;
    }
    
    const matches = state.products.filter(p => p.pesavel && (p.nome.toLowerCase().includes(term) || String(p.PLU).includes(term) || String(p.id).includes(term))).slice(0, 5);
    
    if (matches.length > 0) {
        matches.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${p.nome}</strong> <small class="text-muted">#${p.PLU || p.id} - R$ ${p.preco}</small>`;
            li.addEventListener('click', () => selectLabelProduct(p));
            resultsUl.appendChild(li);
        });
        resultsUl.classList.remove('hidden');
    } else {
        resultsUl.classList.add('hidden');
    }
});

window.selectLabelProduct = (product) => {
    selectedLabelProduct = product;
    document.getElementById('label-product-search').value = '';
    document.getElementById('label-product-results').classList.add('hidden');
    
    document.getElementById('label-selected-product').style.display = 'block';
    document.getElementById('label-prod-name').textContent = product.nome;
    document.getElementById('label-prod-price').textContent = formatMoney(product.preco);
    
    // Update preview
    document.getElementById('lbl-prod-name').textContent = product.nome;
    document.getElementById('lbl-price-kg').textContent = formatMoney(product.preco);
    document.getElementById('lbl-store-name').textContent = state.receiptConfig?.storeName || 'LOJA';
    
    const today = new Date();
    document.getElementById('lbl-date').textContent = formatDate(today.toISOString());
    
    refreshLabelPreview();
};

window.clearLabelProduct = () => {
    selectedLabelProduct = null;
    document.getElementById('label-selected-product').style.display = 'none';
    document.getElementById('lbl-prod-name').textContent = 'Nenhum produto selecionado';
    document.getElementById('lbl-price-kg').textContent = 'R$ 0,00';
    document.getElementById('lbl-weight').textContent = '0,000 kg';
    document.getElementById('lbl-total').textContent = 'R$ 0,00';
    document.getElementById('btn-add-label-queue').disabled = true;
    
    const svg = document.getElementById('lbl-barcode');
    if (svg) svg.innerHTML = '';
    const text = document.getElementById('lbl-barcode-text');
    if (text) text.textContent = '';
};

window.refreshLabelPreview = () => {
    if (!selectedLabelProduct) return;
    
    let weight = state.isScaleConnected ? state.currentScaleWeight : parseFloat(document.getElementById('label-manual-input')?.value.replace(',', '.') || 0);
    
    if (isNaN(weight) || weight <= 0) {
        document.getElementById('btn-add-label-queue').disabled = true;
        return;
    }
    
    const total = weight * selectedLabelProduct.preco;
    
    document.getElementById('lbl-weight').textContent = weight.toFixed(3).replace('.', ',') + ' kg';
    document.getElementById('lbl-total').textContent = formatMoney(total);
    document.getElementById('btn-add-label-queue').disabled = false;
    
    generateLabelBarcode(selectedLabelProduct, weight, total);
};

document.getElementById('label-manual-input')?.addEventListener('input', refreshLabelPreview);

const generateLabelBarcode = (product, weight, total) => {
    const cfg = state.scaleConfig;
    
    // Fallback default config se não estiver configurado no banco: Prefix=2, PLU=5, Val=6, type=price
    const prefixLen = cfg ? cfg.prefix_length : 1;
    const pluLen = cfg ? cfg.plu_length : 5;
    const valLen = cfg ? cfg.value_length : 6;
    const isPrice = cfg ? (cfg.value_type === 'price') : true;
    
    let prefixStr = '2'.padEnd(prefixLen, '0');
    let pluStr = String(product.PLU || product.id).slice(0, pluLen).padStart(pluLen, '0');
    
    let valStr = '';
    if (isPrice) {
        valStr = String(Math.round(total * 100)).slice(0, valLen).padStart(valLen, '0');
    } else {
        valStr = String(Math.round(weight * 1000)).slice(0, valLen).padStart(valLen, '0');
    }
    
    let code12 = prefixStr + pluStr + valStr;
    if (code12.length > 12) code12 = code12.substring(0, 12);
    if (code12.length < 12) code12 = code12.padEnd(12, '0');
    
    // Calcula Checksum EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(code12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const rem = sum % 10;
    const checksum = rem === 0 ? 0 : 10 - rem;
    
    const barcode13 = code12 + checksum;
    
    try {
        if (typeof JsBarcode !== 'undefined') {
            JsBarcode("#lbl-barcode", barcode13, {
                format: "EAN13",
                displayValue: false,
                height: 40,
                width: 1.5,
                margin: 0
            });
            document.getElementById('lbl-barcode-text').textContent = barcode13;
        }
    } catch (e) {
        console.error("Erro ao gerar JsBarcode", e);
    }
};

window.labelQueue = [];

const updateQueueUI = () => {
    const list = document.getElementById('label-queue-list');
    const count = document.getElementById('label-queue-count');
    const printBtn = document.getElementById('btn-print-queue');
    
    count.textContent = window.labelQueue.length;
    
    if (window.labelQueue.length === 0) {
        list.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Fila vazia</li>';
        printBtn.disabled = true;
        return;
    }
    
    printBtn.disabled = false;
    list.innerHTML = '';
    
    window.labelQueue.forEach((item, index) => {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;';
        li.innerHTML = `
            <div style="font-size: 0.85rem; display: flex; flex-direction: column;">
                <strong>${item.name}</strong>
                <span class="text-muted">${item.weight} - ${item.total}</span>
            </div>
            <button class="btn-icon text-danger" style="padding: 0.2rem;" onclick="removeQueueItem(${index})"><i class="fas fa-times"></i></button>
        `;
        list.appendChild(li);
    });
};

window.removeQueueItem = (index) => {
    window.labelQueue.splice(index, 1);
    updateQueueUI();
};

document.getElementById('btn-clear-label-queue')?.addEventListener('click', () => {
    window.labelQueue = [];
    updateQueueUI();
});

document.getElementById('btn-add-label-queue')?.addEventListener('click', () => {
    const labelArea = document.getElementById('label-print-area');
    if (!labelArea || !selectedLabelProduct) return;
    
    const copies = parseInt(document.getElementById('label-add-copies')?.value || 1, 10);
    const htmlSnippet = labelArea.outerHTML;
    
    const itemData = {
        name: document.getElementById('lbl-prod-name').textContent,
        weight: document.getElementById('lbl-weight').textContent,
        total: document.getElementById('lbl-total').textContent,
        html: htmlSnippet
    };
    
    for(let i = 0; i < copies; i++){
        window.labelQueue.push(itemData);
    }
    
    updateQueueUI();
});

document.getElementById('btn-print-queue')?.addEventListener('click', () => {
    const printEl = document.getElementById('print-receipt');
    
    // Força o papel retrato (100x150) pra combinar com a nossa rotação CSS
    const style = document.createElement('style');
    style.id = 'dynamic-label-page-style';
    style.innerHTML = '@page { size: 100mm 150mm; margin: 0; }';
    document.head.appendChild(style);
    
    if (printEl && window.labelQueue.length > 0) {
        let html = '';
        window.labelQueue.forEach((item, i) => {
            html += item.html.replace('id="label-print-area"', `id="label-print-area-${i}"`);
        });
        printEl.innerHTML = html;
        printEl.className = 'printing-label-mode';
    }
    
    setTimeout(() => {
        window.print();
        
        setTimeout(() => {
            if (printEl) {
                printEl.innerHTML = '';
                printEl.className = '';
            }
            const injectedStyle = document.getElementById('dynamic-label-page-style');
            if (injectedStyle) injectedStyle.remove();
        }, 500);
    }, 100);
});

