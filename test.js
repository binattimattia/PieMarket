// ============================================================================
// TEST AUTOMATIZZATO — PIEMARKET (MERCATO AD ASTA)
// Verifica aste, timer, rilanci rapidi (+1, +5), vincolo Piemonte e WebSocket
// ============================================================================

const { WebSocket } = require('ws');
const { server, expiryInterval } = require('./server');

const PORT = 3070;
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
    console.log('--- AVVIO TEST MERCATO AD ASTA PIEMARKET ---');

    // Reset completo file dati
    const fs = require('fs');
    fs.writeFileSync('./data/users.json', JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync('./data/announcements.json', JSON.stringify([], null, 2), 'utf-8');

    await new Promise((resolve) => {
        server.listen(PORT, resolve);
    });
    console.log(`Server d'asta avviato su porta ${PORT}`);

    try {
        // SCENARIO 1: Vincolo Piemonte
        console.log('\n[Scenario 1] Verifica vincolo regionale (rifiuto Lombardia)...');
        const resRegLombardia = await request('/api/register', {
            method: 'POST',
            body: { username: 'milanese', email: 'milanese@lombardia.it', password: 'password123', confirmPassword: 'password123', region: 'Lombardia' }
        });
        if (resRegLombardia.status === 400 && resRegLombardia.json.error.includes('Piemarket è riservato ai residenti in Piemonte')) {
            console.log(' PASSED: Registrazione extra-regionale correttamente respinta.');
        } else {
            throw new Error('FAILED: Registrazione Lombardia permessa!');
        }

        // SCENARIO 2: Registrazione Mario (venditore) e due offerenti (Luca e Giuseppe)
        console.log('\n[Scenario 2] Registrazione utenti piemontesi con ID progressivi...');
        const resMario = await request('/api/register', {
            method: 'POST',
            body: { username: 'mario_venditore', email: 'mario@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const marioId = resMario.json.user.id;

        const resLuca = await request('/api/register', {
            method: 'POST',
            body: { username: 'luca_offerente', email: 'luca@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const lucaId = resLuca.json.user.id;

        const resGiuseppe = await request('/api/register', {
            method: 'POST',
            body: { username: 'giuseppe_offerente', email: 'giuseppe@piemonte.it', password: 'password123', confirmPassword: 'password123', region: 'Piemonte' }
        });
        const giuseppeId = resGiuseppe.json.user.id;

        console.log(` PASSED: Utenti creati: ${marioId}, ${lucaId}, ${giuseppeId}`);

        // Connessione WebSocket di Luca
        const wsLuca = new WebSocket(`ws://127.0.0.1:${PORT}/ws?userId=${lucaId}`);
        const wsMessagesLuca = [];
        await new Promise((resolve, reject) => {
            wsLuca.on('open', resolve);
            wsLuca.on('error', reject);
            wsLuca.on('message', d => wsMessagesLuca.push(JSON.parse(d.toString())));
        });
        console.log(' PASSED: Connessione WebSocket attiva per Luca.');

        // SCENARIO 3: Creazione asta con timer
        console.log('\n[Scenario 3] Mario crea un\'asta con prezzo base di 50 € e durata 1 minuto...');
        const boundary = '----WebKitFormBoundaryAuctionTest';
        const multipartBody = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="title"\r\n\r\nOrologio da collezione\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="description"\r\n\r\nOrologio raro a carica manuale.\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="price"\r\n\r\n50\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="durationMinutes"\r\n\r\n1\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="image"; filename="orologio.jpg"\r\n` +
            `Content-Type: image/jpeg\r\n\r\nfake-image-bytes\r\n` +
            `--${boundary}--\r\n`;

        const resPub = await request('/api/announcements', {
            method: 'POST',
            userId: marioId,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: multipartBody
        });
        if (resPub.status !== 201) throw new Error('Creazione asta fallita');
        const auctionId = resPub.json.announcement.id;
        console.log(` PASSED: Asta creata: ${auctionId} con base: ${resPub.json.announcement.currentBid} € e scadenza calcolata.`);

        await sleep(150);
        const wsNewAnn = wsMessagesLuca.find(m => m.type === 'NEW_ANNOUNCEMENT');
        if (wsNewAnn && wsNewAnn.data.id === auctionId) {
            console.log(' PASSED: Luca ha ricevuto in tempo reale la nuova asta via WebSocket!');
        } else {
            throw new Error('FAILED: Broadcast WebSocket nuova asta mancante.');
        }

        // SCENARIO 4: Il proprietario Mario NON può fare offerte sulla propria asta
        console.log('\n[Scenario 4] Mario tenta di fare un\'offerta sulla propria asta...');
        const resSelfBid = await request(`/api/announcements/${auctionId}/bid`, {
            method: 'POST',
            userId: marioId,
            body: { amount: 60 }
        });
        if (resSelfBid.status === 400 && resSelfBid.json.error.includes('Non puoi fare offerte sulla tua stessa asta')) {
            console.log(' PASSED: Auto-offerta del proprietario correttamente impedita.');
        } else {
            throw new Error('FAILED: Auto-offerta permessa!');
        }

        // SCENARIO 5: Luca effettua un rilancio di +1 € (da 50 a 51 €)
        console.log('\n[Scenario 5] Luca rilancia di +1 € (offerta diventa 51 €)...');
        const resBid1 = await request(`/api/announcements/${auctionId}/bid`, {
            method: 'POST',
            userId: lucaId,
            body: { amount: 51 }
        });
        if (resBid1.status !== 200) throw new Error('Rilancio +1 fallito');
        if (resBid1.json.announcement.currentBid === 51 && resBid1.json.announcement.highestBidderId === lucaId) {
            console.log(` PASSED: Offerta attuale: ${resBid1.json.announcement.currentBid} € - Miglior offerente: Luca`);
        } else {
            throw new Error('FAILED: Rilancio +1 non aggiornato.');
        }

        // SCENARIO 6: Giuseppe effettua un rilancio di +5 € (da 51 a 56 €)
        console.log('\n[Scenario 6] Giuseppe rilancia di +5 € (offerta diventa 56 €)...');
        const resBid2 = await request(`/api/announcements/${auctionId}/bid`, {
            method: 'POST',
            userId: giuseppeId,
            body: { amount: 56 }
        });
        if (resBid2.status !== 200) throw new Error('Rilancio +5 fallito');
        if (resBid2.json.announcement.currentBid === 56 && resBid2.json.announcement.highestBidderId === giuseppeId) {
            console.log(` PASSED: Offerta attuale: ${resBid2.json.announcement.currentBid} € - Miglior offerente: Giuseppe`);
        } else {
            throw new Error('FAILED: Rilancio +5 non aggiornato.');
        }

        // SCENARIO 7: Luca effettua un'offerta libera di 70 €
        console.log('\n[Scenario 7] Luca effettua un\'offerta libera personalizzata di 70 €...');
        const resBid3 = await request(`/api/announcements/${auctionId}/bid`, {
            method: 'POST',
            userId: lucaId,
            body: { amount: 70 }
        });
        if (resBid3.status !== 200) throw new Error('Offerta personalizzata fallita');
        if (resBid3.json.announcement.currentBid === 70 && resBid3.json.announcement.highestBidderId === lucaId) {
            console.log(` PASSED: Offerta attuale: ${resBid3.json.announcement.currentBid} € - Storico rilanci: ${resBid3.json.announcement.bids.length} puntate.`);
        } else {
            throw new Error('FAILED: Offerta personalizzata non aggiornata.');
        }

        // SCENARIO 8: Tentativo di offerta inferiore o uguale a 70 € (deve fallire)
        console.log('\n[Scenario 8] Tentativo di offerta non valida (65 € o 70 €)...');
        const resBadBid = await request(`/api/announcements/${auctionId}/bid`, {
            method: 'POST',
            userId: giuseppeId,
            body: { amount: 65 }
        });
        if (resBadBid.status === 400 && resBadBid.json.error.includes('superiore')) {
            console.log(' PASSED: Offerta inferiore correttamente respinta.');
        } else {
            throw new Error('FAILED: Offerta inferiore permessa!');
        }

        // SCENARIO 9: Verifica broadcast WebSocket dell'evento BID_PLACED
        await sleep(150);
        const wsBidMsg = wsMessagesLuca.filter(m => m.type === 'BID_PLACED');
        if (wsBidMsg.length >= 3) {
            console.log(` PASSED: Ricevuti tutti i ${wsBidMsg.length} aggiornamenti BID_PLACED in diretta via WebSocket!`);
        } else {
            throw new Error('FAILED: Eventi BID_PLACED via WebSocket mancanti.');
        }

        wsLuca.close();
        console.log('\n======================================================');
        console.log(' TUTTI I TEST DEL MERCATO AD ASTA SUPERATI CON SUCCESSO!');
        console.log('======================================================\n');

    } finally {
        clearInterval(expiryInterval);
        server.close();
    }
}

runTests().catch(err => {
    console.error('\n❌ ERRORE TEST:', err.message);
    process.exit(1);
});
