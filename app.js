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
    receitas: []
};

/* ===== Supabase Initialization ===== */
// Prevent Supabase Auth from hanging infinitely due to corrupted localStorage locks
try {
    Object.keys(localStorage).forEach(key => {
        if (key.includes('-lock')) localStorage.removeItem(key);
    });
} catch(e) {}

// Seleção automática de Ambiente (Homologação vs Produção)
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

const supabaseUrl = isProd 
    ? 'https://ljuonnxlpwrrpoiezwyk.supabase.co' 
    : 'https://vbjtdgjdyducsfzrvsxn.supabase.co';

const supabaseKey = isProd 
    ? 'sb_publishable_n8OsbUrccQQcm1VselnSBw_MoOPbeeK' 
    : 'sb_publishable_ue0z_icioGphdp0TiE5zog_xGjyy9lw';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        storageKey: 'mercearia_auth_session'
    }
});

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

const formatDate = (date) => new Intl.DateTimeFormat('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
}).format(new Date(date));

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
    const isEditing = !!document.getElementById('prod-id').value;
    
    stockInput.disabled = !isChecked || isEditing;
    stockInput.required = isChecked && !isEditing;
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
    const nome = document.getElementById('prod-name').value.trim();
    const custoVal = document.getElementById('prod-cost').value;
    const custo = custoVal !== '' ? parseFloat(custoVal) : null;
    const preco = parseFloat(document.getElementById('prod-price').value);
    const estoque = parseFloat(document.getElementById('prod-stock').value) || 0;
    const pesavel = document.getElementById('prod-pesavel').checked;
    const controlar_estoque = document.getElementById('prod-control-stock').checked;

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

    const newProduct = { PLU, nome, preco, custo, estoque, pesavel, controlar_estoque, user_id: state.currentUser.id }; // id gerado automaticamente pelo banco

    try {
        if (prodId) {
            // Update - Não permite alteração na qtde de estoque já existente
            delete newProduct.estoque;
            const { data, error } = await _supabase.from('produtos').update(newProduct).eq('id', prodId).select();
            if (error) throw error;
            
            const index = state.products.findIndex(p => String(p.id) === prodId);
            if (index !== -1) {
                state.products[index] = data && data.length > 0 ? data[0] : { ...state.products[index], ...newProduct };
            }
            showToast('Produto atualizado com sucesso!', 'success');
        } else {
            // Insert
            const { data, error } = await _supabase.from('produtos').insert([newProduct]).select();
            if (error) throw error;

            let savedProduct = newProduct;
            if (data && data.length > 0) {
                savedProduct = data[0];
                state.products.push(savedProduct);
            } else {
                state.products.push(savedProduct);
            }

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
    document.getElementById('prod-name').value = product.nome;
    document.getElementById('prod-cost').value = product.custo !== null && product.custo !== undefined ? product.custo : '';
    document.getElementById('prod-price').value = product.preco;
    document.getElementById('prod-stock').value = product.estoque;
    document.getElementById('prod-pesavel').checked = !!product.pesavel;
    document.getElementById('prod-control-stock').checked = product.controlar_estoque !== false;
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
                    <button class="btn-icon" onclick="editRecipe('${r.id}')" title="Editar"><i class="fas fa-edit text-primary"></i></button>
                    <button class="btn-icon" onclick="deleteRecipe('${r.id}')" title="Excluir"><i class="fas fa-trash text-danger"></i></button>
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

const addIngredientRow = (ingredientData = null) => {
    const id = calcState.nextId++;
    if (ingredientData) {
        calcState.ingredients.push({ id, ...ingredientData });
    } else {
        calcState.ingredients.push({ id, name: '', packageQty: '', packagePrice: '', recipeQty: '', rowCost: 0 });
    }
    renderCalcTable();
    updateCalcTotals();
};

if (btnAddIngredient) {
    btnAddIngredient.addEventListener('click', () => addIngredientRow());
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
        calcIngredientsBody.appendChild(tr);
    });
};

/* Form Submit Logic */
document.getElementById('recipe-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('calc-recipe-id').value;
    const nome = document.getElementById('calc-recipe-name').value.trim();
    const rendimento = parseFloat(calcYieldInput.value) || 1;
    const ingredientes = calcState.ingredients.map(i => ({
        name: i.name,
        packageQty: i.packageQty,
        packagePrice: i.packagePrice,
        recipeQty: i.recipeQty,
        rowCost: i.rowCost
    }));

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
    
    const filtered = state.products.filter(p => {
        const term = searchTerm.toLowerCase();
        return p.nome.toLowerCase().includes(term) || p.PLU.includes(term);
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
        if (!isOutOfStock) {
            card.addEventListener('click', (e) => {
                const currentCard = e.currentTarget;
                currentCard.classList.remove('anim-flash');
                void currentCard.offsetWidth;
                currentCard.classList.add('anim-flash');
                addToCart(p);
            });
        }
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
        const val = e.target.value.trim();
        if (!val) return;
        
        const scaleData = tryParseScaleBarcode(val);
        if (scaleData && scaleData.product) {
            addToCart(scaleData.product, scaleData.qty);
            e.target.value = '';
            renderPosCatalog('');
            return;
        }

        // Busca produto pelo PLU exato (prioridade para leitor)
        const product = state.products.find(p => p.PLU === val);
        
        if (product) {
            addToCart(product);
            e.target.value = '';
            renderPosCatalog('');
        } else {
            // Se não encontrar por PLU exato, mas houver apenas um resultado filtrado, adiciona ele
            const filtered = state.products.filter(p => {
                const term = val.toLowerCase();
                return p.nome.toLowerCase().includes(term) || p.PLU.includes(term);
            });

            if (filtered.length === 1) {
                addToCart(filtered[0]);
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

const addToCart = (product, requestedQty = 1) => {
    const existing = state.cart.find(item => item.product.id === product.id);
    if (existing) {
        if (product.controlar_estoque !== false && existing.qty + requestedQty > product.estoque) {
            showToast('Estoque insuficiente para a quantidade.', 'error');
            return;
        }
        existing.qty += requestedQty;
    } else {
        if (product.controlar_estoque !== false) {
            if (product.estoque < requestedQty && product.estoque > 0) {
               showToast('Estoque insuficiente.', 'error');
               return;
            }
            if (product.estoque <= 0) return;
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
    } else if (item.product.controlar_estoque !== false && newQty > item.product.estoque) {
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
            printReceipt(registeredSale);
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
            <span>Item</span>
            <span>Total</span>
        </div>
    `;

    sale.itens.forEach(item => {
        const itemTotal = item.qty * item.preco;
        const qtyDisplay = (item.qty % 1 !== 0) ? item.qty.toFixed(3).replace('.', ',') + 'kg' : item.qty + 'un';
        
        html += `
            <div class="print-item">
                <div class="print-item-col" style="flex: 1; text-align: left; padding-right: 5px;">
                    <span>${item.nome}</span>
                    <span style="font-size: 10px;">${qtyDisplay} x ${formatMoney(item.preco)}</span>
                </div>
                <div>${formatMoney(itemTotal)}</div>
            </div>
        `;
    });

    html += `
        <div class="print-divider"></div>
        <div class="print-total">TOTAL: ${formatMoney(Number(sale.total))}</div>
        <div style="text-align: right; font-size: 11px; margin-top: 5px;">Pgto: ${sale.forma_pagamento}</div>
    `;

    if (sale.forma_pagamento === 'DINHEIRO' && sale.valor_pago !== undefined && sale.troco !== undefined) {
        html += `
            <div style="text-align: right; font-size: 11px;">Recebido: ${formatMoney(Number(sale.valor_pago))}</div>
            <div style="text-align: right; font-size: 11px;">Troco: ${formatMoney(Number(sale.troco))}</div>
        `;
    }

    let footerMessage = state.receiptConfig.footerMsg;
    if (sale.cliente && sale.cliente.trim() !== '') {
        const displayCliente = toTitleCase(sale.cliente);
        if (footerMessage.includes('{cliente}')) {
            footerMessage = footerMessage.replace('{cliente}', displayCliente);
        } else {
            footerMessage = `Cliente: ${displayCliente}<br>` + footerMessage;
        }
    } else {
        footerMessage = footerMessage.replace('{cliente}', '').replace(' ,', ',').replace('  ', ' ').trim();
    }

    html += `
        <div class="print-footer">
            ${footerMessage}
        </div>
    `;

    printEl.innerHTML = html;
    
    setTimeout(() => {
        window.print();
    }, 100);
};

// Shortcut checkout
document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && document.getElementById('screen-pos').classList.contains('active')) {
        e.preventDefault();
        document.getElementById('btn-checkout').click();
    }
});

document.getElementById('btn-clear-cart').addEventListener('click', () => {
    if (confirm('Cancelar todos os itens da cesta?')) {
        state.cart = [];
        renderCart();
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
            itemMap[item.nome] = (itemMap[item.nome] || 0) + item.qty;
        });
    });
    const topItems = Object.entries(itemMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => `<span class="badge badge-kpi">${name} (${qty})</span>`)
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

    // Tabela de Encomendas
    const tbody = document.getElementById('orders-table-body');
    const emptyMsg = document.getElementById('empty-orders-msg');
    tbody.innerHTML = '';
    
    if (pendingOrders.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        
        const groupedOrders = {};
        pendingOrders.forEach(s => {
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
            if (!s.status_entrega || s.status_entrega === 'PENDENTE') {
                groupedOrders[normalized].pendingDeliveries++;
            }
        });

        Object.values(groupedOrders).sort((a,b) => b.totalDebt - a.totalDebt).forEach((group, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="6" style="padding: 0; border-bottom: none;">
                    <div class="client-orders-header" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background: rgba(var(--primary-color-rgb), 0.05); cursor: pointer; border-bottom: 2px solid var(--border-color);" onclick="toggleClientOrders('client-orders-${index}')">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <strong style="font-size: 1.1rem; color: var(--text-primary);">${toTitleCase(group.clientName)}</strong>
                            <span class="badge ${group.pendingDeliveries > 0 ? 'badge-warning' : 'badge-success'}">${group.orders.length} pedido(s)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 2rem;">
                            <div style="text-align: right;">
                                <strong class="text-danger" style="font-size: 1.1rem;">Falta: ${formatMoney(group.totalDebt)}</strong>
                                <br><small class="text-muted">Total Encomendado: ${formatMoney(group.totalValue)}</small>
                            </div>
                            <i class="fas fa-chevron-down text-muted" id="icon-client-orders-${index}"></i>
                        </div>
                    </div>
                    <div id="client-orders-${index}" class="client-orders-content" style="display: none; padding: 1rem; background: rgba(0, 0, 0, 0.01);">
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
                        produto_id: product.id, type: 'SAÍDA', quantidade: qtyVal, motivo: `Entrega Parcial #${order.id}`, user_id: state.currentUser.id
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
