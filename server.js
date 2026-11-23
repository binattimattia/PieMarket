const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { Server } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = 'users.json';
const ANNOUNCEMENTS_FILE = 'announcements.json';

// --- PERSISTENZA FILE JSON ---
async function readData(file) {
    try {
        const content = await fs.promises.readFile(path.join(DATA_DIR, file), 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

async function writeData(file, data) {
    await fs.promises.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf-8');
}

// Genera ID progressivi semplici (es. user1, announcement1, bid1)
function getNextId(list, prefix) {
    let max = 0;
    list.forEach(item => {
        const num = parseInt(item.id.replace(prefix, ''), 10);
        if (num > max) max = num;
    });
    return `${prefix}${max + 1}`;
}

// --- UPLOAD IMMAGINI (MULTER) ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `img_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Autenticazione basata su ID utente (senza cookie o token complessi)
async function requireAuth(req, res, next) {
    const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
    const users = await readData(USERS_FILE);
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: 'Accesso negato. Utente non autenticato.' });
    req.user = user;
    next();
}

// Helper per associare il nome del venditore all'asta
function enrich(item, users) {
    const seller = users.find(u => u.id === item.userId);
    return { ...item, sellerUsername: seller ? seller.username : 'Venditore' };
}

// Verifica e aggiorna lo stato delle aste scadute
async function checkExpiredAuctions() {
    const list = await readData(ANNOUNCEMENTS_FILE);
    let changed = false;
    const now = Date.now();
    list.forEach(a => {
        if (a.status === 'active' && new Date(a.expiresAt).getTime() <= now) {
            a.status = 'ended';
            changed = true;
            broadcast('AUCTION_ENDED', a);
        }
    });
    if (changed) await writeData(ANNOUNCEMENTS_FILE, list);
    return list;
}

// --- ROTTE PAGINE HTML ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views/register.html')));
app.get('/my-announcements', (req, res) => res.sendFile(path.join(__dirname, 'views/my-announcements.html')));

// --- API AUTENTICAZIONE ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword, region } = req.body;
        if (!username || !email || !password || !confirmPassword || !region) {
            return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
        }
        if (String(region).trim() !== 'Piemonte') {
            return res.status(400).json({ error: 'Piemarket è riservato ai residenti in Piemonte. Al momento non è possibile registrarsi da un\'altra regione.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Le password non coincidono.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La password deve avere almeno 6 caratteri.' });
        }

        const users = await readData(USERS_FILE);
        if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
            return res.status(400).json({ error: 'Indirizzo email già registrato.' });
        }

        const newUser = {
            id: getNextId(users, 'user'),
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
            region: region.trim(),
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        await writeData(USERS_FILE, users);

        const { password: _, ...safeUser } = newUser;
        res.status(201).json({ success: true, user: safeUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await readData(USERS_FILE);
        const user = users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Credenziali non valide. Verifica email e password.' });
        }
        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => res.json({ success: true }));

app.get('/api/me', requireAuth, (req, res) => {
    const { password: _, ...safeUser } = req.user;
    res.json({ success: true, user: safeUser });
});

// --- API ASTE ---
app.get('/api/announcements', async (req, res) => {
    try {
        const list = await checkExpiredAuctions();
        const users = await readData(USERS_FILE);
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, announcements: list.map(a => enrich(a, users)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/announcements/my', requireAuth, async (req, res) => {
    try {
        const list = await checkExpiredAuctions();
        const users = await readData(USERS_FILE);
        const mine = list.filter(a => a.userId === req.user.id && a.status !== 'deleted');
        mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, announcements: mine.map(a => enrich(a, users)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/announcements/:id', async (req, res) => {
    try {
        const list = await checkExpiredAuctions();
        const item = list.find(a => a.id === req.params.id && a.status !== 'deleted');
        if (!item) return res.status(404).json({ error: 'Asta non trovata.' });
        const users = await readData(USERS_FILE);
        res.json({ success: true, announcement: enrich(item, users) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/announcements', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'L\'immagine dell\'asta è obbligatoria.' });
        const { title, description, price, durationMinutes } = req.body;
        const numPrice = Number(price);
        const numDuration = Math.max(1, parseInt(durationMinutes, 10) || 5);

        if (!title || !description || isNaN(numPrice) || numPrice < 0) {
            return res.status(400).json({ error: 'Dati asta non validi.' });
        }

        const list = await readData(ANNOUNCEMENTS_FILE);
        const now = new Date();
        const newAuction = {
            id: getNextId(list, 'announcement'),
            userId: req.user.id,
            title: title.trim(),
            description: description.trim(),
            startingPrice: numPrice,
            currentBid: numPrice,
            highestBidderId: null,
            highestBidderUsername: null,
            image: `/uploads/${req.file.filename}`,
            durationMinutes: numDuration,
            expiresAt: new Date(now.getTime() + numDuration * 60 * 1000).toISOString(),
            status: 'active',
            bids: [],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        list.push(newAuction);
        await writeData(ANNOUNCEMENTS_FILE, list);

        const users = await readData(USERS_FILE);
        const enriched = enrich(newAuction, users);
        broadcast('NEW_ANNOUNCEMENT', enriched);
        res.status(201).json({ success: true, announcement: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/announcements/:id/bid', requireAuth, async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Importo offerta non valido.' });

        const list = await readData(ANNOUNCEMENTS_FILE);
        const auction = list.find(a => a.id === req.params.id && a.status !== 'deleted');
        if (!auction) return res.status(404).json({ error: 'Asta non trovata.' });

        if (auction.userId === req.user.id) {
            return res.status(400).json({ error: 'Non puoi fare offerte sulla tua stessa asta.' });
        }

        if (auction.status !== 'active' || new Date(auction.expiresAt).getTime() <= Date.now()) {
            auction.status = 'ended';
            await writeData(ANNOUNCEMENTS_FILE, list);
            broadcast('AUCTION_ENDED', auction);
            return res.status(400).json({ error: 'L\'asta è terminata.' });
        }

        if (amount <= auction.currentBid) {
            return res.status(400).json({ error: `L'offerta deve essere superiore all'offerta attuale (${auction.currentBid} €).` });
        }

        const now = new Date().toISOString();
        auction.currentBid = amount;
        auction.highestBidderId = req.user.id;
        auction.highestBidderUsername = req.user.username;
        auction.updatedAt = now;
        auction.bids.push({
            id: `bid${auction.bids.length + 1}`,
            userId: req.user.id,
            username: req.user.username,
            amount,
            createdAt: now
        });

        await writeData(ANNOUNCEMENTS_FILE, list);
        const users = await readData(USERS_FILE);
        const enriched = enrich(auction, users);
        broadcast('BID_PLACED', enriched);
        res.json({ success: true, announcement: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const item = list.find(a => a.id === req.params.id);
        if (!item) return res.status(404).json({ error: 'Asta non trovata.' });
        if (item.userId !== req.user.id) return res.status(403).json({ error: 'Non autorizzato.' });

        item.status = 'deleted';
        await writeData(ANNOUNCEMENTS_FILE, list);
        broadcast('ANNOUNCEMENT_REMOVED', { id: item.id });
        res.json({ success: true, message: 'Asta rimossa.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SERVER HTTP & WEBSOCKET ---
const server = http.createServer(app);
const wsServer = new Server({ server, path: '/ws' });

wsServer.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    ws.userId = url.searchParams.get('userId') || 'anon';
    console.log(`[WebSocket] Connesso: ${ws.userId}`);
    ws.on('close', () => console.log(`[WebSocket] Chiuso: ${ws.userId}`));
});

function broadcast(type, data = {}) {
    const msg = JSON.stringify({ type, data });
    wsServer.clients.forEach(c => {
        if (c.readyState === 1) c.send(msg);
    });
}

const expiryInterval = setInterval(checkExpiredAuctions, 3000);

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Piemarket (Aste) avviato su http://localhost:${PORT}`);
    });
}

module.exports = { app, server, expiryInterval };
