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
    movimentacoes: []
};

/* ===== Supabase Initialization ===== */
// Prevent Supabase Auth from hanging infinitely due to corrupted localStorage locks
try {
    Object.keys(localStorage).forEach(key => {
        if (key.includes('-lock')) localStorage.removeItem(key);
    });
} catch(e) {}

const _supabase = supabase.createClient('https://vbjtdgjdyducsfzrvsxn.supabase.co', 'sb_publishable_ue0z_icioGphdp0TiE5zog_xGjyy9lw', {
    auth: {
        storageKey: 'mercearia_auth_session' // HOMOLOGAÇÃO
    }
});

/*const _supabase = supabase.createClient('https://ljuonnxlpwrrpoiezwyk.supabase.co', 'sb_publishable_n8OsbUrccQQcm1VselnSBw_MoOPbeeK', {
    auth: {
        storageKey: 'mercearia_auth_session' // PRODUÇÃO
    }
});*/

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
    if (routeId === 'screen-settings' && state.userRole !== 'admin') {
        showToast('Acesso negado. Apenas administradores podem acessar as configurações.', 'error');
        return;
    }
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
        const storedConfig = localStorage.getItem('receiptConfig_' + state.currentUser.id);
        if (storedConfig) {
            state.receiptConfig = JSON.parse(storedConfig);
        }

        const { data: produtos } = await _supabase.from('produtos').select('*').eq('user_id', state.currentUser.id);
        if (produtos) state.products = produtos;
        
        const { data: vendas } = await _supabase.from('vendas').select('*').eq('user_id', state.currentUser.id);
        if (vendas) state.sales = vendas;

        const { data: movs } = await _supabase.from('movimentacoes').select('*').eq('user_id', state.currentUser.id);
        if (movs) state.movimentacoes = movs;
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
const renderProductsTable = () => {
    const tbody = document.getElementById('products-table-body');
    const emptyMsg = document.getElementById('empty-products-msg');
    tbody.innerHTML = '';
    
    if (state.products.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        state.products.forEach(p => {
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
    const PLU = document.getElementById('prod-code').value.trim();
    const nome = document.getElementById('prod-name').value.trim();
    const preco = parseFloat(document.getElementById('prod-price').value);
    const estoque = parseFloat(document.getElementById('prod-stock').value) || 0;
    const pesavel = document.getElementById('prod-pesavel').checked;
    const controlar_estoque = document.getElementById('prod-control-stock').checked;

    // Prevent duplicate codes locally
    if (state.products.some(p => p.PLU === PLU && String(p.id) !== prodId)) {
        showToast('Código de barras já cadastrado no banco.', 'error');
        return;
    }

    const newProduct = { PLU, nome, preco, estoque, pesavel, controlar_estoque, user_id: state.currentUser.id }; // id gerado automaticamente pelo banco

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
    document.getElementById('prod-price').value = product.preco;
    document.getElementById('prod-stock').value = product.estoque;
    document.getElementById('prod-pesavel').checked = !!product.pesavel;
    document.getElementById('prod-control-stock').checked = product.controlar_estoque !== false;
    toggleStockInput();

    productModal.classList.add('active');
};

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
        if (!isOutOfStock) card.addEventListener('click', () => addToCart(p));
        grid.appendChild(card);
    });
};

document.getElementById('pos-search').addEventListener('input', (e) => renderPosCatalog(e.target.value));

const tryParseScaleBarcode = (barcode) => {
    const cfg = state.scaleConfig;
    if (!cfg) return null;
    
    const expectedLen = cfg.prefix_length + cfg.plu_length + cfg.value_length + 1; // +1 checksum
    if (barcode.length !== expectedLen && barcode.length !== expectedLen - 1) return null;
    
    // Extracted strings
    const pluStr = barcode.substring(cfg.prefix_length, cfg.prefix_length + cfg.plu_length);
    const valueStr = barcode.substring(cfg.prefix_length + cfg.plu_length, cfg.prefix_length + cfg.plu_length + cfg.value_length);
    
    const pluNum = parseInt(pluStr, 10);
    const product = state.products.find(p => (p.PLU === pluStr || String(p.PLU) === String(pluNum)) && p.pesavel);
    if (!product) return null;

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

    // Save Sale
    const sale = {
        data: new Date().toISOString(),
        total,
        totalItens,
        cliente: clienteName || null,
        forma_pagamento: method,
        status: method === 'ENCOMENDA' ? 'ENCOMENDA' : 'CONCLUIDA',
        data_conclusao: method === 'ENCOMENDA' ? null : new Date().toISOString(),
        user_id: state.currentUser.id,
        itens: state.cart.map(item => ({
            id: item.product.id,
            PLU: item.product.PLU,
            nome: item.product.nome,
            preco: item.product.preco,
            qty: item.qty
        }))
    };
    if (valorPago !== null) sale.valor_pago = valorPago;
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
    const pendingOrders = state.sales.filter(s => s.status === 'ENCOMENDA');
    
    // KPIs
    document.getElementById('kpi-orders-count').textContent = pendingOrders.length;
    const totalPending = pendingOrders.reduce((sum, s) => sum + Number(s.total), 0);
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
        .map(([name, qty]) => `<span class="badge badge-info">${name} (${qty})</span>`)
        .join(' ');
    document.getElementById('kpi-top-ordered-items').innerHTML = topItems || 'Nenhum item pendente';

    // Maiores devedores
    const debtorMap = {};
    const debtorPrettyNames = {}; // Para guardar a versão "bonita" do nome
    
    pendingOrders.forEach(s => {
        if (s.cliente) {
            const normalized = normalizeName(s.cliente);
            debtorMap[normalized] = (debtorMap[normalized] || 0) + Number(s.total);
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
        
        pendingOrders.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${s.id}</strong></td>
                <td><span class="text-muted">${formatDate(s.data)}</span></td>
                <td>${toTitleCase(s.cliente)}</td>
                <td><strong>${formatMoney(Number(s.total))}</strong></td>
                <td><span class="text-muted">${s.itens.length} tipo(s) de item</span></td>
                <td class="text-right">
                    <button class="btn btn-success btn-small" onclick="openDeliveryModal('${s.id}')"><i class="fas fa-check"></i> Entregar</button>
                    <button class="btn btn-ghost btn-small text-danger" onclick="cancelOrder('${s.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

window.openDeliveryModal = (orderId) => {
    const order = state.sales.find(s => String(s.id) === String(orderId));
    if (!order) return;
    
    currentDeliveryOrderId = orderId;
    document.getElementById('delivery-modal-total').textContent = formatMoney(Number(order.total));
    deliveryModal.classList.add('active');
};

if (document.querySelector('.close-delivery')) {
    document.querySelector('.close-delivery').addEventListener('click', () => {
        deliveryModal.classList.remove('active');
    });
}

document.querySelectorAll('.btn-delivery-payment').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const method = e.currentTarget.dataset.method;
        await finalizeDelivery(method);
    });
});

const finalizeDelivery = async (method) => {
    if (!currentDeliveryOrderId) return;
    
    const order = state.sales.find(s => String(s.id) === String(currentDeliveryOrderId));
    if (!order) return;

    try {
        const now = new Date().toISOString();
        const updateData = {
            status: 'CONCLUIDA',
            forma_pagamento: method,
            data_conclusao: now
        };

        const { error: updateError } = await _supabase.from('vendas').update(updateData).eq('id', currentDeliveryOrderId);
        if (updateError) throw updateError;

        // Descontar estoque no momento da entrega
        for (let item of order.itens) {
            const product = state.products.find(p => p.id === item.id || String(p.PLU) === String(item.PLU));
            if (product && product.controlar_estoque !== false) {
                const qtyVal = Number(Number(item.qty).toFixed(3));
                const newStock = Number((product.estoque - qtyVal).toFixed(3));
                
                await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                
                // Registra movimentação
                const newMov = {
                    produto_id: product.id,
                    tipo: 'SAÍDA',
                    quantidade: qtyVal,
                    motivo: `Entrega Encomenda #${order.id}`,
                    user_id: state.currentUser.id
                };
                const { data: movData } = await _supabase.from('movimentacoes').insert([newMov]).select();
                if (movData && movData.length > 0) state.movimentacoes.push(movData[0]);
                
                product.estoque = newStock;
            }
        }

        showToast(`Encomenda #${order.id} entregue e finalizada com sucesso!`, 'success');
        deliveryModal.classList.remove('active');
        await renderOrders();
    } catch (err) {
        showToast('Erro ao finalizar entrega.', 'error');
        console.error(err);
    }
};

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

const renderReports = async (resetPage = true) => {
    if (resetPage) state.currentReportPage = 1;

    const startInput = document.getElementById('filter-date-start').value;
    const endInput = document.getElementById('filter-date-end').value;
    
    // Refresh to get latest DB changes
    await loadData();
    // Apenas vendas CONCLUIDAS aparecem no relatório de vendas
    let filteredSales = state.sales.filter(s => s.status === 'CONCLUIDA');
    
    if (startInput || endInput) {
        const startDate = startInput ? new Date(startInput + 'T00:00:00') : new Date('2000-01-01');
        const endDate = endInput ? new Date(endInput + 'T23:59:59') : new Date('2100-01-01');
        
        filteredSales = filteredSales.filter(s => {
            // Usa data de conclusão para o relatório, ou data normal se nao hover conclusao (vendas diretas)
            const saleDate = new Date(s.data_conclusao || s.data);
            return saleDate >= startDate && saleDate <= endDate;
        });
    }

    const totalSalesNum = filteredSales.length;
    const revenue = filteredSales.reduce((sum, s) => sum + Number(s.total), 0);
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
                <td><span class="badge ${s.forma_pagamento === 'PIX' ? 'badge-success' : s.forma_pagamento === 'CARTÃO' ? 'badge-info' : 'badge-warning'}">${s.forma_pagamento}</span></td>
                <td><strong>${formatMoney(Number(s.total))}</strong></td>
                <td class="text-right">
                    <button class="btn btn-ghost btn-small" onclick="viewSaleDetails('${s.id}')"><i class="fas fa-eye"></i> Detalhes</button>
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
    document.getElementById('detail-sale-payment').textContent = sale.forma_pagamento;
    
    const cashInfo = document.getElementById('detail-sale-cash-info');
    if (sale.forma_pagamento === 'DINHEIRO' && sale.valor_pago !== undefined && sale.valor_pago !== null && sale.troco !== undefined && sale.troco !== null) {
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.nome}</strong><br><small class="text-muted">#${item.PLU}</small></td>
            <td>${formatMoney(item.preco)}</td>
            <td>${item.qty} un.</td>
            <td class="text-right font-weight-bold">${formatMoney(subtotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    saleDetailsModal.classList.add('active');
};

const receiptConfigModal = document.getElementById('receipt-config-modal');

window.openReceiptConfigModal = () => {
    document.getElementById('receipt-store-name').value = state.receiptConfig.storeName;
    document.getElementById('receipt-footer-msg').value = state.receiptConfig.footerMsg;
    receiptConfigModal.classList.add('active');
};

document.getElementById('receipt-config-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.receiptConfig.storeName = document.getElementById('receipt-store-name').value;
    state.receiptConfig.footerMsg = document.getElementById('receipt-footer-msg').value;
    
    // Save locally
    localStorage.setItem('receiptConfig_' + state.currentUser.id, JSON.stringify(state.receiptConfig));
    
    receiptConfigModal.classList.remove('active');
    showToast('Layout do recibo atualizado!', 'success');
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
        prefix_length: parseInt(document.getElementById('scale-prefix-len').value),
        plu_length: parseInt(document.getElementById('scale-plu-len').value),
        value_length: parseInt(document.getElementById('scale-val-len').value),
        value_type: document.getElementById('scale-val-type').value,
        user_id: state.currentUser.id
    };

    try {
        const { error } = await _supabase.from('scale_configs').upsert(config, { onConflict: 'user_id' });
        if (error) throw error;
        state.scaleConfig = config;
        showToast('Configuração salva com sucesso!', 'success');
        scaleModal.classList.remove('active');
    } catch(err) {
        console.error(err);
        showToast('Erro ao salvar configurações.', 'error');
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

    // Buscar Configuração de Balança
    const { data: scaleData } = await _supabase.from('scale_configs').select('*').eq('user_id', session.user.id).single();
    if (scaleData) {
        state.scaleConfig = scaleData;
    }

    const userEmail = session.user.email;
    const displayName = state.userRole === 'admin' ? `${userEmail} (Admin)` : `${userEmail} (Caixa)`;
    app.usernameDisplay.textContent = displayName.length > 22 ? displayName.substring(0, 22) + '...' : displayName;
    app.usernameDisplay.title = displayName;

    if (state.userRole === 'admin') {
        const navSettings = document.getElementById('nav-settings');
        if (navSettings) navSettings.style.display = 'flex';
    }

    await loadData();
    navigateTo('screen-pos');
})();
