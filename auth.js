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

const app = {
    screens: document.querySelectorAll('.screen'),
    toastContainer: document.getElementById('toast-container')
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

const navigateTo = (routeId) => {
    app.screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(routeId);
    if (target) target.classList.add('active');
};

document.querySelectorAll('.switch-auth').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.target.dataset.target);
    });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('login-username').value.trim();
    const senhaInput = document.getElementById('login-password').value;
    
    if(!loginInput || !senhaInput) return;

    try {
        Object.keys(localStorage).forEach(key => {
            if (key.includes('-lock')) localStorage.removeItem(key);
        });
    } catch(err) {}

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

    try {
        const { error } = await _supabase.auth.signInWithPassword({
            email: loginInput,
            password: senhaInput
        });

        if (error) throw error;
        // The onAuthStateChange listener will redirect.
    } catch(err) {
        showToast(err.message || 'Erro ao realizar login!', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Acessar Sistema';
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('reg-username').value.trim();
    const senhaInput = document.getElementById('reg-password').value;

    if(!loginInput || !senhaInput) return;

    try {
        Object.keys(localStorage).forEach(key => {
            if (key.includes('-lock')) localStorage.removeItem(key);
        });
    } catch(err) {}

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';

    try {
        const { data, error } = await _supabase.auth.signUp({
            email: loginInput,
            password: senhaInput
        });
        
        if (error) throw error;

        if (data.session) {
            // Logged in immediately, listener will redirect
        } else if (data.user) {
            showToast('Conta criada! Verifique seu email para confirmar.', 'info');
            document.getElementById('register-form').reset();
            navigateTo('screen-login');
            btn.disabled = false;
            btn.innerHTML = 'Cadastrar-se';
        }
    } catch(err) {
        showToast('Erro ao realizar cadastro.', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Cadastrar-se';
    }
});

// Listener to check session and redirect to Home
_supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        window.location.href = 'home.html';
    }
});

// Initial load check
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        window.location.href = 'home.html';
    }
})();
