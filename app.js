/* ===== State Management ===== */
const state = {
    currentUser: null,
    products: JSON.parse(localStorage.getItem('mercearia_products')) || [],
    sales: JSON.parse(localStorage.getItem('mercearia_sales')) || [],
    cart: []
};

// Observers to update UI when state changes
const saveState = () => {
    localStorage.setItem('mercearia_products', JSON.stringify(state.products));
    localStorage.setItem('mercearia_sales', JSON.stringify(state.sales));
};

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
const formatMoney = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (date) => {
    return new Intl.DateTimeFormat('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(new Date(date));
};

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

const navigateTo = (routeId) => {
    // Check Auth
    if (!state.currentUser && routeId !== 'screen-login' && routeId !== 'screen-register') {
        navigateTo('screen-login');
        return;
    }

    // Hide all screens
    app.screens.forEach(s => s.classList.remove('active'));
    
    // Show target screen
    const target = document.getElementById(routeId);
    if (target) {
        target.classList.add('active');
    }

    // Handle Sidebar Visibility
    if (routeId.startsWith('screen-login') || routeId.startsWith('screen-register')) {
        toggleSidebar(false);
    } else {
        toggleSidebar(true);
        // Update active nav link
        const navRoute = routeId.replace('screen-', '');
        app.navLinks.forEach(link => {
            if (link.dataset.route === navRoute) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        
        // Refresh specific screen data on navigation
        if (routeId === 'screen-products') renderProductsTable();
        if (routeId === 'screen-pos') renderPosCatalog();
        if (routeId === 'screen-reports') renderReports();
    }
};

// Nav Link Clicks
app.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(`screen-${link.dataset.route}`);
    });
});

/* ===== Authentication ===== */
document.querySelectorAll('.switch-auth').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.target.dataset.target);
    });
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    // Mock Login (accepts any non-empty)
    if (user.trim()) {
        state.currentUser = user;
        app.usernameDisplay.textContent = user;
        showToast(`Bem-vindo de volta, ${user}!`, 'success');
        document.getElementById('login-form').reset();
        navigateTo('screen-pos');
    }
});

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('reg-username').value;
    if (user.trim()) {
        state.currentUser = user;
        app.usernameDisplay.textContent = user;
        showToast('Conta criada com sucesso!', 'success');
        document.getElementById('register-form').reset();
        navigateTo('screen-pos');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    state.currentUser = null;
    showToast('Sessão encerrada', 'info');
    navigateTo('screen-login');
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
            const statusClass = p.stock > 10 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger';
            const statusText = p.stock > 10 ? 'Em Estoque' : p.stock > 0 ? 'Baixo Estoque' : 'Esgotado';
            
            tr.innerHTML = `
                <td><span class="text-muted">#${p.code}</span></td>
                <td><strong>${p.name}</strong></td>
                <td>${formatMoney(p.price)}</td>
                <td>${p.stock} un.</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="text-right">
                    <button class="btn-icon" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

document.getElementById('btn-new-product').addEventListener('click', () => {
    productModal.classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        productModal.classList.remove('active');
        document.getElementById('product-form').reset();
    });
});

document.getElementById('product-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('prod-code').value;
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const stock = parseInt(document.getElementById('prod-stock').value);

    // Prevent duplicate codes
    if (state.products.some(p => p.code === code)) {
        showToast('Código de barras já cadastrado.', 'error');
        return;
    }

    state.products.push({ id: generateId(), code, name, price, stock });
    saveState();
    
    productModal.classList.remove('active');
    e.target.reset();
    renderProductsTable();
    showToast('Produto adicionado com sucesso!', 'success');
});

window.deleteProduct = (id) => {
    if (confirm('Remover este produto do sistema?')) {
        state.products = state.products.filter(p => p.id !== id);
        saveState();
        renderProductsTable();
        showToast('Produto removido.', 'info');
    }
};

/* ===== Modules: POS ===== */
const updateClock = () => {
    const clockEl = document.getElementById('pos-clock');
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('pt-BR');
    }
};
setInterval(updateClock, 1000);
updateClock();

const renderPosCatalog = (searchTerm = '') => {
    const grid = document.getElementById('pos-products-grid');
    grid.innerHTML = '';
    
    const filtered = state.products.filter(p => {
        const term = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || p.code.includes(term);
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><p>Produto não encontrado.</p></div>`;
        return;
    }

    filtered.forEach(p => {
        const isOutOfStock = p.stock <= 0;
        const card = document.createElement('div');
        card.className = `product-card ${isOutOfStock ? 'opacity-50' : ''}`;
        card.innerHTML = `
            <span class="stock">${p.stock} un.</span>
            <span class="code">#${p.code}</span>
            <span class="name">${p.name}</span>
            <span class="price">${formatMoney(p.price)}</span>
        `;
        if (!isOutOfStock) {
            card.addEventListener('click', () => addToCart(p));
        }
        grid.appendChild(card);
    });
};

document.getElementById('pos-search').addEventListener('input', (e) => {
    renderPosCatalog(e.target.value);
});
// Global keyboard shortcut to focus search
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.getElementById('screen-pos').classList.contains('active')) {
        e.preventDefault();
        document.getElementById('pos-search').focus();
    }
});

const addToCart = (product) => {
    const existing = state.cart.find(item => item.product.id === product.id);
    
    if (existing) {
        if (existing.qty >= product.stock) {
            showToast('Estoque insuficiente.', 'error');
            return;
        }
        existing.qty += 1;
    } else {
        if (product.stock <= 0) return;
        state.cart.push({ product, qty: 1 });
    }
    
    renderCart();
};

window.updateCartQty = (productId, delta) => {
    const item = state.cart.find(i => i.product.id === productId);
    if (!item) return;
    
    const newQty = item.qty + delta;
    if (newQty <= 0) {
        state.cart = state.cart.filter(i => i.product.id !== productId);
    } else if (newQty > item.product.stock) {
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

    let totalItems = 0;
    let totalValue = 0;

    state.cart.forEach(item => {
        totalItems += item.qty;
        const itemTotal = item.qty * item.product.price;
        totalValue += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.product.name}</h4>
                <p>${formatMoney(item.product.price)} un.</p>
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

    countEl.textContent = `${totalItems} itens`;
    subtotalEl.textContent = formatMoney(totalValue);
    totalEl.textContent = formatMoney(totalValue); // Assumes no tax/discount initially
    checkoutBtn.disabled = false;
    clearBtn.disabled = false;
};

// Checkout
document.getElementById('btn-checkout').addEventListener('click', () => {
    if (state.cart.length === 0) return;

    const total = state.cart.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
    const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);

    // Save Sale
    const sale = {
        id: generateId().toUpperCase(),
        date: new Date().toISOString(),
        items: [...state.cart],
        total,
        totalItems
    };
    state.sales.push(sale);
    
    // Deduct Stock
    state.cart.forEach(cartItem => {
        const product = state.products.find(p => p.id === cartItem.product.id);
        if (product) {
            product.stock -= cartItem.qty;
        }
    });

    saveState();
    
    // Clear Cart
    state.cart = [];
    renderCart();
    renderPosCatalog(); // Refresh stock displays
    
    // Play subtle success sound or show heavy toast
    showToast(`Venda ${sale.id} finalizada com sucesso!`, 'success');
});

// Checkout shortcut F2
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

const renderReports = () => {
    // Get filter dates
    const startInput = document.getElementById('filter-date-start').value;
    const endInput = document.getElementById('filter-date-end').value;
    
    let filteredSales = [...state.sales];
    
    if (startInput || endInput) {
        // Parse dates to start/end of day for accurate filtering
        const startDate = startInput ? new Date(startInput + 'T00:00:00') : new Date('2000-01-01');
        const endDate = endInput ? new Date(endInput + 'T23:59:59') : new Date('2100-01-01');
        
        filteredSales = filteredSales.filter(s => {
            const saleDate = new Date(s.date);
            return saleDate >= startDate && saleDate <= endDate;
        });
    }

    // KPIs
    const totalSales = filteredSales.length;
    const revenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const avgTicket = totalSales > 0 ? revenue / totalSales : 0;

    document.getElementById('kpi-total-sales').textContent = totalSales;
    document.getElementById('kpi-total-revenue').textContent = formatMoney(revenue);
    document.getElementById('kpi-avg-ticket').textContent = formatMoney(avgTicket);

    // Table
    const tbody = document.getElementById('sales-table-body');
    const emptyMsg = document.getElementById('empty-sales-msg');
    
    tbody.innerHTML = '';
    
    if (filteredSales.length === 0) {
        emptyMsg.classList.remove('hidden');
        tbody.parentElement.classList.add('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        tbody.parentElement.classList.remove('hidden');
        
        // Show newest first
        const sortedSales = filteredSales.reverse();
        
        sortedSales.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${s.id}</strong></td>
                <td><span class="text-muted"><i class="far fa-clock"></i> ${formatDate(s.date)}</span></td>
                <td>${s.totalItems} iten(s)</td>
                <td><strong>${formatMoney(s.total)}</strong></td>
                <td class="text-right">
                    <button class="btn btn-ghost btn-small" onclick="viewSaleDetails('${s.id}')"><i class="fas fa-eye"></i> Detalhes</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

window.viewSaleDetails = (saleId) => {
    const sale = state.sales.find(s => s.id === saleId);
    if (!sale) return;

    document.getElementById('detail-sale-id').textContent = `#${sale.id}`;
    document.getElementById('detail-sale-date').textContent = formatDate(sale.date);
    document.getElementById('detail-sale-total').textContent = formatMoney(sale.total);

    const tbody = document.getElementById('sale-items-body');
    tbody.innerHTML = '';

    sale.items.forEach(item => {
        const subtotal = item.qty * item.product.price;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.product.name}</strong><br><small class="text-muted">#${item.product.code}</small></td>
            <td>${formatMoney(item.product.price)}</td>
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
        // also handles product modal
        productModal.classList.remove('active');
        if(document.getElementById('product-form')) {
           document.getElementById('product-form').reset();
        }
    });
});

/* ===== App Initialization ===== */
// Seed dummy data if empty for demonstration
if (state.products.length === 0) {
    state.products = [
        { id: generateId(), code: '78912345', name: 'Arroz Branco 5kg', price: 25.90, stock: 50 },
        { id: generateId(), code: '78912346', name: 'Feijão Carioca 1kg', price: 8.50, stock: 100 },
        { id: generateId(), code: '78912347', name: 'Óleo de Soja 900ml', price: 6.99, stock: 120 },
        { id: generateId(), code: '78912348', name: 'Café Torrado 500g', price: 18.90, stock: 30 },
        { id: generateId(), code: '78912349', name: 'Açúcar Refinado 1kg', price: 4.50, stock: 80 },
        { id: generateId(), code: '78912350', name: 'Macarrão Espaguete', price: 3.20, stock: 200 }
    ];
    saveState();
}

// Start App
navigateTo('screen-login');
