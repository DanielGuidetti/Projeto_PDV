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

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginInput, password: senhaInput })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao realizar login!');

        localStorage.setItem('mercearia_token', data.session.access_token);
        localStorage.setItem('mercearia_user', JSON.stringify(data.session.user));
        
        window.location.href = 'home.html';
    } catch(err) {
        if (err.message === 'Failed to fetch' || err.message === 'Load failed' || err.message.includes('NetworkError')) {
            showDisconnectError();
        } else {
            showToast(err.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = 'Acessar Sistema';
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('reg-username').value.trim();
    const senhaInput = document.getElementById('reg-password').value;

    if(!loginInput || !senhaInput) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginInput, password: senhaInput })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao realizar cadastro.');

        showToast('Conta criada! Você já pode fazer login.', 'success');
        document.getElementById('register-form').reset();
        navigateTo('screen-login');
        btn.disabled = false;
        btn.innerHTML = 'Cadastrar-se';
    } catch(err) {
        if (err.message === 'Failed to fetch' || err.message === 'Load failed' || err.message.includes('NetworkError')) {
            showDisconnectError();
        } else {
            showToast(err.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = 'Cadastrar-se';
    }
});

// Initial load check
(() => {
    const token = localStorage.getItem('mercearia_token');
    if (token) {
        window.location.href = 'home.html';
    }
})();

// Password Visibility Toggle
document.querySelectorAll('.password-toggle').forEach(icon => {
    icon.addEventListener('click', function() {
        const input = this.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            this.classList.remove('fa-eye');
            this.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            this.classList.remove('fa-eye-slash');
            this.classList.add('fa-eye');
        }
    });
});

