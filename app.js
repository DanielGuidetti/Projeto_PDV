/* ===== State Management ===== */
const state = {
    currentUser: null,
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
    navLinks: document.querySelectorAll('.nav-links a'),
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
        const { data: produtos } = await _supabase.from('produtos').select('*');
        if (produtos) state.products = produtos;
        
        const { data: vendas } = await _supabase.from('vendas').select('*');
        if (vendas) state.sales = vendas;

        const { data: movs } = await _supabase.from('movimentacoes').select('*');
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
            const statusClass = p.estoque > 10 ? 'badge-success' : p.estoque > 0 ? 'badge-warning' : 'badge-danger';
            const statusText = p.estoque > 10 ? 'Em Estoque' : p.estoque > 0 ? 'Baixo Estoque' : 'Esgotado';
            
            tr.innerHTML = `
                <td><span class="text-muted">#${p.PLU}</span></td>
                <td><strong>${p.nome}</strong></td>
                <td>${formatMoney(p.preco)}</td>
                <td>${p.estoque} un.</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="text-right">
                    <button class="btn-icon" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

document.getElementById('btn-new-product').addEventListener('click', () => productModal.classList.add('active'));

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        productModal.classList.remove('active');
        if(document.getElementById('product-form')) document.getElementById('product-form').reset();
    });
});

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const PLU = document.getElementById('prod-code').value.trim();
    const nome = document.getElementById('prod-name').value.trim();
    const preco = parseFloat(document.getElementById('prod-price').value);
    const estoque = parseInt(document.getElementById('prod-stock').value);

    // Prevent duplicate codes locally
    if (state.products.some(p => p.PLU === PLU)) {
        showToast('Código de barras já cadastrado no banco.', 'error');
        return;
    }

    const newProduct = { PLU, nome, preco, estoque }; // id gerado automaticamente pelo banco

    try {
        const { data, error } = await _supabase.from('produtos').insert([newProduct]).select();
        if (error) throw error;

        if (data && data.length > 0) {
            state.products.push(data[0]);
        } else {
            state.products.push(newProduct);
        }
        
        productModal.classList.remove('active');
        e.target.reset();
        renderProductsTable();
        showToast('Produto adicionado com sucesso!', 'success');
    } catch(err) {
        showToast('Erro ao salvar produto no banco.', 'error');
        console.error(err);
    }
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
        const isOutOfStock = p.estoque <= 0;
        const card = document.createElement('div');
        card.className = `product-card ${isOutOfStock ? 'opacity-50' : ''}`;
        card.innerHTML = `
            <span class="stock">${p.estoque} un.</span>
            <span class="code">#${p.PLU}</span>
            <span class="name">${p.nome}</span>
            <span class="price">${formatMoney(p.preco)}</span>
        `;
        if (!isOutOfStock) card.addEventListener('click', () => addToCart(p));
        grid.appendChild(card);
    });
};

document.getElementById('pos-search').addEventListener('input', (e) => renderPosCatalog(e.target.value));
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.getElementById('screen-pos').classList.contains('active')) {
        e.preventDefault();
        document.getElementById('pos-search').focus();
    }
});

const addToCart = (product) => {
    const existing = state.cart.find(item => item.product.id === product.id);
    if (existing) {
        if (existing.qty >= product.estoque) {
            showToast('Estoque insuficiente para a quantidade.', 'error');
            return;
        }
        existing.qty += 1;
    } else {
        if (product.estoque <= 0) return;
        state.cart.push({ product, qty: 1 });
    }
    renderCart();
};

window.updateCartQty = (productId, delta) => {
    const item = state.cart.find(i => String(i.product.id) === String(productId));
    if (!item) return;
    
    const newQty = item.qty + delta;
    if (newQty <= 0) {
        state.cart = state.cart.filter(i => String(i.product.id) !== String(productId));
    } else if (newQty > item.product.estoque) {
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
        totalItens += item.qty;
        const itemTotal = item.qty * item.product.preco;
        totalValue += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.product.nome}</h4>
                <p>${formatMoney(item.product.preco)} un.</p>
            </div>
            <div class="cart-item-actions">
                <button class="btn-icon" onclick="updateCartQty('${item.product.id}', -1)"><i class="fas fa-minus circle"></i></button>
                <span class="qty">${item.qty}</span>
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
        await completeCheckout(method);
    });
});

const completeCheckout = async (method) => {
    if (state.cart.length === 0) return;

    checkoutModal.classList.remove('active'); // fecha o modal

    const checkoutBtn = document.getElementById('btn-checkout');
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

    const total = state.cart.reduce((sum, item) => sum + (item.product.preco * item.qty), 0);
    const totalItens = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const clienteName = document.getElementById('pos-customer-name')?.value.trim();

    // Save Sale
    const sale = {
        data: new Date().toISOString(),
        total,
        totalItens,
        cliente: clienteName || null,
        forma_pagamento: method,
        itens: state.cart.map(item => ({
            id: item.product.id,
            PLU: item.product.PLU,
            nome: item.product.nome,
            preco: item.product.preco,
            qty: item.qty
        }))
    };

    try {
        const { data: saleData, error: saleError } = await _supabase.from('vendas').insert([sale]).select();
        if (saleError) throw saleError;

        // Deduct Stock
        for (let cartItem of state.cart) {
            const product = state.products.find(p => p.id === cartItem.product.id);
            if (product) {
                const newStock = product.estoque - cartItem.qty;
                await _supabase.from('produtos').update({ estoque: newStock }).eq('id', product.id);
                product.estoque = newStock;
            }
        }

        const registeredSale = saleData && saleData.length > 0 ? saleData[0] : sale;
        state.sales.push(registeredSale);
        state.cart = [];
        
        // Limpar inputs de checkout
        const customerInput = document.getElementById('pos-customer-name');
        if (customerInput) customerInput.value = '';

        renderCart();
        renderPosCatalog();
        
        showToast(`Venda ${registeredSale.id || ''} finalizada com sucesso!`, 'success');
    } catch (err) {
        showToast('Erro ao processar venda no banco.', 'error');
        console.error(err);
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Venda (F2)';
    }
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

/* ===== Modules: Reports ===== */
const saleDetailsModal = document.getElementById('sale-details-modal');

document.getElementById('btn-filter-reports').addEventListener('click', () => {
    renderReports();
});

const renderReports = async () => {
    const startInput = document.getElementById('filter-date-start').value;
    const endInput = document.getElementById('filter-date-end').value;
    
    // Refresh to get latest DB changes
    await loadData();
    let filteredSales = [...state.sales];
    
    if (startInput || endInput) {
        const startDate = startInput ? new Date(startInput + 'T00:00:00') : new Date('2000-01-01');
        const endDate = endInput ? new Date(endInput + 'T23:59:59') : new Date('2100-01-01');
        
        filteredSales = filteredSales.filter(s => {
            const saleDate = new Date(s.data);
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
    tbody.innerHTML = '';
    
    if (filteredSales.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        
        // Mostrar do mais novo pro mais velho
        const sortedSales = filteredSales.sort((a,b) => new Date(b.data) - new Date(a.data));
        
        sortedSales.forEach(s => {
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
    }
};

window.viewSaleDetails = (saleId) => {
    const sale = state.sales.find(s => String(s.id) === String(saleId));
    if (!sale) return;

    document.getElementById('detail-sale-id').textContent = `#${sale.id}`;
    document.getElementById('detail-sale-date').textContent = formatDate(sale.data);
    document.getElementById('detail-sale-customer').textContent = sale.cliente || 'Não Informado';
    document.getElementById('detail-sale-payment').textContent = sale.forma_pagamento;
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

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        saleDetailsModal.classList.remove('active');
        productModal.classList.remove('active');
        if(document.getElementById('product-form')) {
           document.getElementById('product-form').reset();
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
            
            tr.innerHTML = `
                <td><span class="text-muted"><i class="far fa-clock"></i> ${formatDate(m.data_movimentacao)}</span></td>
                <td><strong>${product ? product.nome : 'Produto Removido (' + m.produto_id + ')'}</strong></td>
                <td><span class="${typeClass} font-weight-bold"><i class="fas ${typeIcon}"></i> ${m.tipo}</span></td>
                <td>${m.quantidade} un.</td>
                <td><span class="text-muted">${m.motivo || '-'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
};

document.getElementById('btn-new-movement').addEventListener('click', () => {
    const select = document.getElementById('mov-product');
    select.innerHTML = '<option value="" disabled selected>Selecione um produto</option>';
    state.products.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nome} (Atual: ${p.estoque} un.)</option>`;
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
    const quantidade = parseInt(document.getElementById('mov-qty').value);
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
        motivo
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

/* ===== App Initialization ===== */
// Start App
(async () => {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (!session || error) {
        window.location.href = 'index.html';
        return;
    }
    
    state.currentUser = session.user;
    const userEmail = session.user.email;
    app.usernameDisplay.textContent = userEmail.length > 15 ? userEmail.substring(0, 15) + '...' : userEmail;
    app.usernameDisplay.title = userEmail;
    
    await loadData();
    navigateTo('screen-pos');
})();
