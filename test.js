// ============================================================================
// TEST AUTOMATIZZATO - PIEMARKET
// Verifica scenari, esclusività accettazione offerte (max 1 offerta accettata)
// e scomparsa degli annunci venduti dalla home page
// ============================================================================

const { WebSocket } = require('ws');
const { server } = require('./server');

const PORT = 3065;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(urlPath, options = {}) {
    const url = `${BASE_URL}${urlPath}`;
    const headers = options.headers || {};

    if (options.userId) {
        headers['x-user-id'] = options.userId;
    }

    let bodyData = null;
    if (options.body) {
        if (typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json';
            bodyData = JSON.stringify(options.body);
        } else {
            bodyData = options.body;
        }
    }

    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: bodyData,
        redirect: 'manual'
    });

    let json = null;
    let text = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        json = await response.json();
    } else {
        text = await response.text();
    }

    return {
        status: response.status,
        headers: response.headers,
        json,
        text
    };
}

async function runTests() {
    console.log('--- AVVIO TEST DI CONVALIDA REGOLA SINGOLA OFFERTA E HOME SENZA VENDUTI ---');

    // Reset dati per test pulito
    const fs = require('fs');
    fs.writeFileSync('./data/users.json', JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync('./data/announcements.json', JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync('./data/offers.json', JSON.stringify([], null, 2), 'utf-8');

    await new Promise((resolve) => {
        server.listen(PORT, resolve);
    });
    console.log(`Server avviato su porta ${PORT}`);

    try {
        // Registrazione Mario (venditore -> user1)
        const resMario = await request('/api/register', {
            method: 'POST',
            body: { username: 'mario_rossi', email: 'mario@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const marioId = resMario.json.user.id;

        // Registrazione Luca (primo acquirente -> user2)
        const resLuca = await request('/api/register', {
            method: 'POST',
            body: { username: 'luca_bianchi', email: 'luca@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const lucaId = resLuca.json.user.id;

        // Registrazione Giuseppe (secondo acquirente -> user3)
        const resGiuseppe = await request('/api/register', {
            method: 'POST',
            body: { username: 'giuseppe_verdi', email: 'giuseppe@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const giuseppeId = resGiuseppe.json.user.id;

        console.log(` PASSED: Utenti registrati: ${marioId}, ${lucaId}, ${giuseppeId}`);

        // Connessione WebSocket di Giuseppe
        const wsGiuseppe = new WebSocket(`ws://127.0.0.1:${PORT}/ws?userId=${giuseppeId}`);
        const wsMessagesGiuseppe = [];
        await new Promise((resolve, reject) => {
            wsGiuseppe.on('open', resolve);
            wsGiuseppe.on('error', reject);
            wsGiuseppe.on('message', (d) => wsMessagesGiuseppe.push(JSON.parse(d.toString())));
        });

        // Mario pubblica announcement1
        const boundary = '----WebKitFormBoundarySingleOfferTest';
        const multipartBody = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="title"\r\n\r\nBici da corsa\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="description"\r\n\r\nBici nuova mai usata.\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="price"\r\n\r\n100\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="image"; filename="bici.jpg"\r\n` +
            `Content-Type: image/jpeg\r\n\r\nfake-image-bytes\r\n` +
            `--${boundary}--\r\n`;

        const resPub = await request('/api/announcements', {
            method: 'POST',
            userId: marioId,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: multipartBody
        });
        const announcementId = resPub.json.announcement.id;
        console.log(` PASSED: Annuncio pubblicato: ${announcementId}`);

        // Verifica che l'annuncio compaia inizialmente nella home
        const resHome1 = await request('/api/announcements');
        if (resHome1.json.announcements.some(a => a.id === announcementId)) {
            console.log(' PASSED: L\'annuncio attivo è presente nella bacheca iniziale.');
        } else {
            throw new Error('Annuncio attivo non trovato in bacheca');
        }

        // Offerta 1: Luca propone 80 €
        const resOffer1 = await request('/api/offers', {
            method: 'POST',
            userId: lucaId,
            body: { announcementId, amount: 80, message: 'Offro 80' }
        });
        const offer1Id = resOffer1.json.offer.id;

        // Offerta 2: Giuseppe propone 85 € per lo stesso annuncio
        const resOffer2 = await request('/api/offers', {
            method: 'POST',
            userId: giuseppeId,
            body: { announcementId, amount: 85, message: 'Offro 85' }
        });
        const offer2Id = resOffer2.json.offer.id;
        console.log(` PASSED: Mario ha ricevuto due offerte concorrenti: ${offer1Id} e ${offer2Id}`);

        // Mario accetta l'offerta 1 di Luca (80 €)
        const resAccept1 = await request(`/api/offers/${offer1Id}/accept`, {
            method: 'POST',
            userId: marioId
        });
        if (resAccept1.status !== 200 || resAccept1.json.offer.status !== 'accepted') {
            throw new Error('Accettazione prima offerta fallita');
        }
        console.log(` PASSED: Mario ha accettato l'offerta ${offer1Id}`);

        // VERIFICA REGOLA LOGICA 1: Mario NON deve poter accettare l'offerta 2 di Giuseppe
        const resAccept2 = await request(`/api/offers/${offer2Id}/accept`, {
            method: 'POST',
            userId: marioId
        });
        if (resAccept2.status === 400 && (resAccept2.json.error.includes('già stato venduto') || resAccept2.json.error.includes('non è più in corso'))) {
            console.log(' PASSED: Il server impedisce correttamente di accettare una seconda offerta!');
        } else {
            throw new Error(`FAILED: Il server ha permesso di accettare due offerte contemporaneamente! Status: ${resAccept2.status}`);
        }

        // VERIFICA REGOLA LOGICA 2: L'annuncio venduto NON deve più comparire nella Home
        const resHome2 = await request('/api/announcements');
        const isPresentInHome = resHome2.json.announcements.some(a => a.id === announcementId);
        if (!isPresentInHome) {
            console.log(' PASSED: L\'annuncio venduto è scomparso dalla Home page!');
        } else {
            throw new Error('FAILED: L\'annuncio venduto compare ancora nella Home page!');
        }

        // VERIFICA REGOLA LOGICA 3: Nessun utente può più fare offerte o controfferte sull'annuncio venduto
        const resOfferNew = await request('/api/offers', {
            method: 'POST',
            userId: giuseppeId,
            body: { announcementId, amount: 90, message: 'Nuovo tentativo' }
        });
        if (resOfferNew.status === 400 && resOfferNew.json.error.includes('già stato venduto')) {
            console.log(' PASSED: Il server rifiuta nuove offerte sull\'annuncio già venduto.');
        } else {
            throw new Error('FAILED: Nuova offerta accettata su annuncio già venduto!');
        }

        // VERIFICA REGOLA LOGICA 4: L'altra offerta (offer2) è stata automaticamente annullata
        const resGiuseppeSent = await request('/api/offers/sent', { userId: giuseppeId });
        const gOffer = resGiuseppeSent.json.offers.find(o => o.id === offer2Id);
        if (gOffer && gOffer.status === 'cancelled') {
            console.log(' PASSED: L\'offerta concorrente è passata automaticamente a stato "cancelled"!');
        } else {
            throw new Error('FAILED: L\'offerta concorrente non è stata annullata!');
        }

        await sleep(100);
        const cancelWsMsg = wsMessagesGiuseppe.find(m => m.type === 'OFFER_CANCELLED');
        if (cancelWsMsg) {
            console.log(' PASSED: Giuseppe ha ricevuto l\'evento WebSocket di annullamento della propria offerta!');
        }

        wsGiuseppe.close();
        console.log('\n======================================================');
        console.log(' TUTTE LE NUOVE REGOLE E VERIFICHE SONO STATE SUPERATE!');
        console.log('======================================================\n');

    } finally {
        server.close();
    }
}

runTests().catch(err => {
    console.error('\n❌ ERRORE TEST:', err.message);
    process.exit(1);
});
