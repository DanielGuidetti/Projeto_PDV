const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign({ id: 3, role: 'user' }, 'mercearia_secreta_local_jwt_key', { expiresIn: '1d' });

const productData = {
    PLU: '7896227650158',
    nome: 'Absorvente Cottonbaby Lady',
    estoque: 4,
    custo: 1,
    preco: 3,
    referencia: '',
    controlar_estoque: true,
    pesavel: false,
    permitir_estoque_negativo: false
};

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/produtos',
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('STATUS:', res.statusCode, 'DATA:', data));
});
req.on('error', console.error);
req.write(JSON.stringify(productData));
req.end();
