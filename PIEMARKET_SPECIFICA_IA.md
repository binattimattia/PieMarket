# PIEMARKET --- Specifica completa per lo sviluppo dell'applicazione

> **Documento di progetto destinato a un'IA di programmazione.**\
> Segui queste istruzioni come specifica funzionale e tecnica. Prima di
> scrivere codice, leggi tutto il documento, pianifica la struttura e
> verifica che ogni requisito sia coperto. Non sostituire le tecnologie
> richieste con framework o servizi diversi.

------------------------------------------------------------------------

## 1. Obiettivo del progetto

Realizzare **Piemarket**, una piattaforma web di annunci e compravendita
tra utenti residenti esclusivamente in **Piemonte**.

L'idea è una bacheca regionale: gli utenti possono pubblicare annunci di
oggetti in vendita o da regalare, consultare quelli pubblicati dagli
altri, inviare offerte e negoziare con il proprietario attraverso un
sistema di controfferte.

Il progetto nasce come applicazione didattica per dimostrare le
conoscenze acquisite su:

-   Node.js;
-   Express;
-   modulo `http`;
-   modulo `fs` e lettura/scrittura di file;
-   JSON;
-   WebSocket client-server tramite il pacchetto **`ws`**;
-   comunicazione bidirezionale e broadcast;
-   manipolazione del DOM con JavaScript;
-   Bootstrap per l'interfaccia.

**WebSocket è un requisito tassativo e deve essere una parte centrale
dell'applicazione**, non un'aggiunta marginale. Deve essere usato per
aggiornare in tempo reale lo stato delle trattative e notificare gli
utenti coinvolti.

### 1.1 Nome

Nome di lavoro: **Piemarket**.

Il nome deve richiamare chiaramente il Piemonte e il concetto di
marketplace. Mantieni il nome facilmente modificabile in un unico punto
(titolo, navbar, footer e documentazione).

Altre alternative possibili, se serve proporre varianti prima dello
sviluppo:

-   PiemontMarket
-   Piemontè
-   Piemarket -- La piazza degli annunci piemontesi

Non cambiare autonomamente il nome scelto senza motivo.

### 1.2 Pubblico

La piattaforma è riservata a persone che dichiarano di risiedere in
Piemonte. Non deve essere possibile completare la registrazione
selezionando un'altra regione.

Il progetto è una dimostrazione didattica: non integrare pagamenti
reali, spedizioni, sistemi bancari o servizi esterni di compravendita.

------------------------------------------------------------------------

## 2. Tecnologie e vincoli

### 2.1 Stack richiesto

**Backend** - Node.js - Express - `http` di Node.js - `ws` per WebSocket
(obbligatorio) - `fs` di Node.js per la persistenza su file JSON -
CommonJS (`require` e `module.exports`)

**Frontend** - HTML - CSS - JavaScript vanilla - Bootstrap 5 per layout,
navbar, form, pulsanti, card, modal, alert e badge - Bootstrap Icons
facoltativo

**Persistenza** - File `.json` locali nella cartella `data/`. - Non
utilizzare database SQL o NoSQL. - Non usare array come archivio
persistente principale: utenti, annunci e trattative devono essere
salvati nei file JSON. - È comunque consentito caricare i dati JSON in
memoria durante l'esecuzione per elaborarli, filtrarli e iterarli,
riscrivendo poi il file aggiornato.

### 2.2 Dipendenze

Usa solo le dipendenze realmente necessarie. Come base:

-   `express`
-   `ws`

Per l'upload delle immagini si può usare `multer`. Per la sicurezza
delle password si può usare una libreria di hashing come `bcryptjs`. Se
vengono introdotte dipendenze ulteriori, spiegare nel README perché
servono e non aggiungerle senza necessità.

Non introdurre React, Vue, Angular, Next.js, TypeScript, Socket.IO o
altri framework che sostituiscano lo stack richiesto. **Non usare
Socket.IO: il modulo obbligatorio è `ws`.**

### 2.3 Struttura generale server

Express deve gestire le richieste HTTP e servire le pagine e le risorse
statiche. Il server HTTP deve essere creato esplicitamente e condiviso
con il server WebSocket.

Schema concettuale obbligatorio:

``` js
const express = require('express');
const http = require('http');
const { Server } = require('ws');

const app = express();

// Middleware Express e rotte...

const server = http.createServer(app);

// WebSocket collegato allo stesso server HTTP.
const ws_server = new Server({
    server: server,
    path: '/ws'
});

server.listen(PORT, () => {
    console.log(`Piemarket avviato sulla porta ${PORT}`);
});
```

Adatta il codice al progetto reale, mantenendo però: - `require()`; -
`http.createServer(app)`; - `new Server({ server, path: '/ws' })`; -
eventi WebSocket `connection`, `message` e `close`; - invio con
`send()`; - broadcast tramite `ws_server.clients`.

------------------------------------------------------------------------

## 3. Funzionalità e pagine

### 3.1 Pagine principali

Prevedere almeno:

1.  **Registrazione**
2.  **Login**
3.  **Home / Annunci**
4.  **Dettaglio annuncio** tramite modal
5.  **Offerte** ricevute e inviate
6.  **I miei annunci**
7.  **Profilo / Logout** (anche semplice)

La navbar, quando l'utente è autenticato, deve contenere: - logo/nome
Piemarket; - Home; - I miei annunci; - Offerte; - nome utente o menu
profilo; - pulsante ben visibile **Pubblica annuncio**.

La voce **Offerte** deve essere sempre facilmente raggiungibile.
Mostrare un badge con il numero di offerte o aggiornamenti non letti, se
possibile.

### 3.2 Registrazione

Il modulo di registrazione deve contenere esattamente questi cinque
campi:

1.  Nome Utente
2.  Email
3.  Password
4.  Conferma password
5.  Regione di residenza

La regione deve essere selezionabile da un menu a tendina con le regioni
italiane. Solo **Piemonte** permette di completare la registrazione.

Regole: - tutti i campi sono obbligatori; - email con formato valido; -
email non già registrata; - nome utente non vuoto e con lunghezza
ragionevole; - password e conferma password devono coincidere; -
password con requisiti minimi ragionevoli; - se la regione non è
Piemonte, bloccare la registrazione e mostrare un messaggio chiaro; - il
controllo della regione deve essere effettuato **anche sul server**, non
soltanto nel browser; - non salvare mai la password in chiaro: salvare
un hash della password; - non restituire mai hash o password nelle
risposte HTTP o WebSocket.

Messaggio suggerito se la regione non è Piemonte: \> Piemarket è
riservato ai residenti in Piemonte. Al momento non è possibile
registrarsi da un'altra regione.

Dopo una registrazione valida, creare la sessione utente e reindirizzare
alla Home oppure chiedere di effettuare il login. Scegli un flusso
coerente e documentalo.

### 3.3 Login e sessione

Prevedere un login con email e password.

L'utente deve poter: - accedere; - mantenere la sessione durante la
navigazione; - uscire tramite Logout; - accedere alle funzioni riservate
soltanto dopo autenticazione.

Non fidarti di un `userId` inviato dal browser per stabilire l'identità.
Il server deve ricavare l'utente autenticato dalla sessione verificata.

Per un prototipo scolastico si può usare una soluzione di sessione
semplice, ma deve essere documentata e non deve esporre password o dati
sensibili. La sessione HTTP deve essere riconosciuta anche durante
l'handshake WebSocket, così il server può associare ogni connessione
all'utente autenticato.

Se si usa `express-session`, configurare correttamente il cookie e
condividere/verificare la sessione anche sul collegamento WebSocket. Non
lasciare il server WebSocket accessibile a utenti non autenticati.

### 3.4 Home: bacheca annunci

Dopo il login, l'utente visualizza la Home con gli annunci pubblicati
dagli utenti piemontesi.

Ogni annuncio deve essere mostrato in una card Bootstrap contenente: -
immagine; - titolo; - prezzo; - nome utente del venditore; - data di
pubblicazione; - pulsante o area cliccabile per aprire i dettagli.

Per gli oggetti regalati, il prezzo deve essere visualizzato come
**Gratis**.

Funzionalità utili: - ordinamento dal più recente al meno recente; -
ricerca per titolo; - filtro per fascia di prezzo, se semplice da
realizzare; - stato vuoto gradevole quando non ci sono annunci; -
caricamento delle immagini con dimensioni coerenti e
`object-fit: cover`.

Non mostrare password, email o dati privati dei venditori nella bacheca.

### 3.5 Pubblicazione di un annuncio

Nella parte alta della Home deve esserci il pulsante **Pubblica
annuncio**.

Al click si apre un **modal Bootstrap** con i seguenti campi
obbligatori:

1.  Titolo
2.  Immagine
3.  Descrizione
4.  Prezzo

Regole: - titolo obbligatorio e con lunghezza massima definita; -
descrizione obbligatoria e con lunghezza massima definita; - immagine
obbligatoria, con formati ammessi (ad esempio JPG, PNG, WEBP) e limite
di dimensione; - prezzo numerico maggiore o uguale a zero; - prezzo `0`
significa che l'oggetto è regalato; - l'utente autenticato diventa
automaticamente il proprietario; - data di creazione generata dal
server; - non accettare dal browser un proprietario diverso dall'utente
autenticato.

L'immagine deve essere caricata sul server e salvata in una cartella
dedicata (ad esempio `public/uploads/`). Nel JSON va salvato il percorso
relativo dell'immagine, non il contenuto binario in Base64.

Dopo la pubblicazione: - salvare il nuovo annuncio in
`data/announcements.json`; - chiudere il modal; - aggiornare la Home; -
inviare una notifica WebSocket agli utenti connessi affinché la bacheca
possa aggiornarsi senza ricaricare la pagina.

Prevedere anche la possibilità per il proprietario di modificare o
eliminare un proprio annuncio. Non consentire di modificare o eliminare
annunci altrui.

### 3.6 Dettaglio annuncio

Quando un utente clicca su una card, aprire un **modal Bootstrap**
con: - immagine grande; - titolo; - descrizione; - prezzo; -
venditore; - data di pubblicazione; - pulsante **Acquista**; - pulsante
**Fai un'offerta**.

Se l'utente è il proprietario: - non deve poter fare un'offerta a sé
stesso; - può visualizzare un'indicazione che l'annuncio è suo; - può
modificarlo o eliminarlo.

#### Pulsante Acquista

Non implementare pagamenti reali.

Il pulsante **Acquista** deve creare una richiesta di acquisto al prezzo
indicato, da sottoporre al venditore. La richiesta deve apparire nella
sezione Offerte del venditore, dove potrà essere accettata o rifiutata.

Se il prezzo è zero, il pulsante può essere chiamato **Richiedi
oggetto** o **Lo voglio**.

Dopo l'accettazione: - segnare la trattativa come accettata; - segnare
l'annuncio come non più disponibile oppure `reserved/sold` secondo la
logica scelta; - impedire nuove trattative sull'annuncio quando non è
più disponibile; - notificare in tempo reale entrambe le parti.

Non dichiarare che il pagamento è stato effettuato: l'applicazione
gestisce soltanto il contatto e l'accordo tra utenti.

#### Pulsante Fai un'offerta

Al click, mostrare un piccolo form/modal con: - importo proposto; -
eventuale messaggio facoltativo.

L'importo deve essere numerico, positivo e coerente con le regole del
progetto. Il server deve verificare che l'annuncio esista, sia attivo e
non appartenga all'utente che propone.

Dopo l'invio, la proposta deve comparire nella sezione Offerte del
venditore e nella sezione Offerte dell'acquirente.

------------------------------------------------------------------------

## 4. Sistema di offerte e controfferte

Questa è una delle funzionalità principali e deve essere progettata con
attenzione.

### 4.1 Sezione Offerte

La pagina **Offerte** deve distinguere chiaramente:

-   **Ricevute:** trattative relative ai propri annunci;
-   **Inviate:** offerte proposte ad altri venditori.

Ogni trattativa deve mostrare: - annuncio di riferimento; - immagine e
titolo dell'annuncio; - prezzo originale; - ultima cifra proposta; -
nome dell'altra persona; - ultimo messaggio, se presente; - stato della
trattativa; - data dell'ultimo aggiornamento.

### 4.2 Flusso di negoziazione

Esempio:

1.  Mario pubblica un oggetto a 100 €.
2.  Luca propone 80 €.
3.  Mario vede la proposta nella sezione **Offerte ricevute**.
4.  Mario può:
    -   accettare l'offerta;
    -   rifiutarla;
    -   inviare una controfferta, ad esempio 90 €.
5.  Luca vede la controfferta nella sezione **Offerte inviate**.
6.  Luca può:
    -   accettare;
    -   rifiutare;
    -   inviare una nuova controfferta, ad esempio 85 €.
7.  La trattativa prosegue finché una delle parti accetta/rifiuta oppure
    viene annullata.

Ogni nuova proposta deve essere registrata nello storico della
trattativa, senza sovrascrivere e perdere le proposte precedenti.

### 4.3 Stati possibili

Definire stati chiari, ad esempio:

-   `pending_seller`: in attesa della risposta del venditore;
-   `pending_buyer`: in attesa della risposta dell'acquirente;
-   `accepted`: accordo raggiunto;
-   `rejected`: proposta rifiutata;
-   `cancelled`: trattativa annullata;
-   `expired`: annuncio non più disponibile o trattativa scaduta.

Le transizioni devono essere validate dal server. Soltanto la persona a
cui è rivolta la proposta corrente può accettarla o rifiutarla. La
persona che ha ricevuto l'ultima proposta può inviare una controfferta.

Quando una trattativa è conclusa, non consentire ulteriori offerte nella
stessa trattativa.

### 4.4 Aggiornamenti in tempo reale

WebSocket deve essere usato per notificare: - nuova offerta ricevuta; -
nuova controfferta; - offerta accettata; - offerta rifiutata; -
trattativa annullata; - annuncio appena pubblicato; - annuncio
modificato o non più disponibile.

Quando arriva una nuova offerta: - il venditore riceve un aggiornamento
senza ricaricare la pagina; - il badge della navbar si aggiorna; - la
lista Offerte si aggiorna; - se il venditore è collegato ma si trova in
un'altra pagina, riceve una notifica discreta.

Quando arriva una controfferta: - l'acquirente riceve l'aggiornamento in
tempo reale; - la sezione Offerte si aggiorna; - viene mostrato
chiaramente chi deve rispondere.

**Importante:** il WebSocket serve a notificare gli eventi, ma la fonte
persistente dei dati rimane il file JSON. Se un utente è offline, al
successivo accesso deve trovare comunque offerte e notifiche aggiornate
leggendo i file JSON tramite HTTP.

------------------------------------------------------------------------

## 5. Architettura WebSocket obbligatoria

### 5.1 Client

Il frontend deve aprire una connessione WebSocket autenticata al
percorso `/ws`.

Usare il costruttore nativo:

``` js
const protocol = location.origin.replace(/^http/, 'ws');
const webSocket = new WebSocket(`${protocol}/ws`);
```

Gestire almeno: - `onopen`; - `onmessage`; - `onclose`; - `onerror`.

I messaggi ricevuti devono essere interpretati con
`JSON.parse(event.data)`. I messaggi inviati devono essere serializzati
con `JSON.stringify()`.

Prima di inviare un messaggio, controllare che la connessione sia aperta
(`WebSocket.OPEN`).

### 5.2 Server

Il server deve usare:

``` js
const { Server } = require('ws');
```

e collegare il server WebSocket al server HTTP Express:

``` js
const ws_server = new Server({
    server: server,
    path: '/ws'
});
```

Gestire: - evento `connection`; - evento `message`; - evento `close`.

Associare ogni connessione all'utente autenticato. È possibile assegnare
una proprietà custom, ad esempio `ws.userId`, e un identificativo
progressivo `ws.id`.

Gestire più connessioni contemporaneamente, anche se lo stesso utente
apre più schede.

### 5.3 Protocollo JSON

Definire un protocollo chiaro, uniforme e documentato. Ogni messaggio
dovrebbe contenere almeno:

``` json
{
  "type": "NEW_OFFER",
  "data": {
    "offerId": "offer_123"
  }
}
```

Esempi di tipi evento: - `NEW_ANNOUNCEMENT` - `ANNOUNCEMENT_UPDATED` -
`ANNOUNCEMENT_REMOVED` - `NEW_OFFER` - `COUNTER_OFFER` -
`OFFER_ACCEPTED` - `OFFER_REJECTED` - `OFFER_UPDATED` - `NOTIFICATION` -
`ERROR`

Il client non deve poter ordinare al server di inviare notifiche
arbitrarie ad altri utenti. Il server deve verificare identità, permessi
e dati prima di modificare i JSON o inviare un evento.

### 5.4 Invio e broadcast

Implementare almeno due modalità:

1.  **Broadcast generale:** inviare un evento a tutti i client
    autenticati connessi, ad esempio quando viene pubblicato un nuovo
    annuncio.
2.  **Invio mirato:** inviare un evento soltanto alle connessioni
    appartenenti a uno o più utenti coinvolti nella trattativa.

Per il broadcast generale utilizzare `ws_server.clients` e `forEach()`,
verificando che il client sia nello stato `WebSocket.OPEN`.

Per l'invio mirato, scorrere le connessioni e confrontare l'identità
associata alla connessione con gli ID destinatari.

Il server deve essere l'unica autorità che decide a chi inviare gli
eventi.

### 5.5 Esempio di messaggio client-server

Client → Server:

``` json
{
  "type": "PING_APP",
  "data": {}
}
```

Server → Client:

``` json
{
  "type": "NOTIFICATION",
  "data": {
    "title": "Nuova offerta",
    "message": "Hai ricevuto una nuova proposta per un tuo annuncio."
  }
}
```

La modifica di un'offerta deve avvenire tramite una richiesta HTTP
autenticata oppure tramite un messaggio WebSocket validato. Scegli una
strategia coerente e documentala. In ogni caso, la validazione e la
modifica dei file devono essere eseguite dal server, mai dal browser.

### 5.6 Riconnessione

Se la connessione si interrompe: - mostrare un indicatore discreto di
disconnessione; - tentare la riconnessione con un ritardo progressivo e
limitato; - dopo la riconnessione, aggiornare i dati tramite le normali
rotte HTTP; - non considerare i messaggi WebSocket come archivio
permanente.

Non implementare un sistema complesso di stanze WebSocket se non è
necessario: per il progetto bastano broadcast e invio mirato agli
utenti.

------------------------------------------------------------------------

## 6. Gestione dei file JSON

### 6.1 Struttura cartelle

Organizzare il progetto in modo ordinato. Una possibile struttura:

``` text
piemarket/
│
├── server.js
├── package.json
├── README.md
│
├── data/
│   ├── users.json
│   ├── announcements.json
│   ├── offers.json
│   └── notifications.json
│
├── routes/
│   ├── auth.js
│   ├── announcements.js
│   └── offers.js
│
├── services/
│   ├── jsonStore.js
│   ├── authService.js
│   ├── announcementService.js
│   ├── offerService.js
│   └── websocketService.js
│
├── middleware/
│   └── authMiddleware.js
│
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── websocket.js
│   │   ├── announcements.js
│   │   └── offers.js
│   ├── uploads/
│   └── images/
│
└── views/
    ├── login.html
    ├── register.html
    └── home.html
```

Questa struttura è indicativa: puoi modificarla se esiste una ragione
concreta, ma mantieni separati server, rotte, servizi, frontend e dati.

### 6.2 Esempio `users.json`

``` json
[
  {
    "id": "user_001",
    "username": "mario",
    "email": "mario@example.com",
    "passwordHash": "HASH_DELLA_PASSWORD",
    "region": "Piemonte",
    "createdAt": "2026-01-10T10:00:00.000Z"
  }
]
```

Non salvare password in chiaro.

### 6.3 Esempio `announcements.json`

``` json
[
  {
    "id": "announcement_001",
    "userId": "user_001",
    "title": "Bicicletta usata",
    "description": "Bicicletta in buone condizioni.",
    "image": "/uploads/bicicletta.jpg",
    "price": 80,
    "status": "active",
    "createdAt": "2026-01-10T10:30:00.000Z",
    "updatedAt": "2026-01-10T10:30:00.000Z"
  }
]
```

### 6.4 Esempio `offers.json`

``` json
[
  {
    "id": "offer_001",
    "announcementId": "announcement_001",
    "buyerId": "user_002",
    "sellerId": "user_001",
    "status": "pending_seller",
    "history": [
      {
        "id": "proposal_001",
        "fromUserId": "user_002",
        "toUserId": "user_001",
        "amount": 65,
        "message": "Saresti disposto ad accettare 65 euro?",
        "createdAt": "2026-01-10T11:00:00.000Z"
      }
    ],
    "createdAt": "2026-01-10T11:00:00.000Z",
    "updatedAt": "2026-01-10T11:00:00.000Z"
  }
]
```

Ogni elemento di `history` rappresenta una proposta o controproposta.
Non eliminare le proposte precedenti.

### 6.5 Esempio `notifications.json`

``` json
[
  {
    "id": "notification_001",
    "userId": "user_001",
    "type": "NEW_OFFER",
    "title": "Nuova offerta",
    "message": "Hai ricevuto una proposta.",
    "relatedId": "offer_001",
    "read": false,
    "createdAt": "2026-01-10T11:00:00.000Z"
  }
]
```

### 6.6 Regole di persistenza

Creare un servizio centralizzato per leggere e scrivere i JSON. Evitare
di duplicare codice di lettura/scrittura in ogni rotta.

Requisiti: - se un file non esiste, inizializzarlo con `[]`; - gestire
errori di lettura e parsing JSON; - usare `JSON.parse()` per leggere e
`JSON.stringify()` per scrivere; - usare percorsi costruiti a partire da
`__dirname`; - non sovrascrivere un file con dati vuoti a seguito di un
errore di lettura; - attendere il completamento della scrittura prima di
confermare l'operazione; - evitare scritture concorrenti che possano
perdere aggiornamenti; - scrivere i file in modo sicuro, preferibilmente
tramite file temporaneo e successiva sostituzione; - mantenere i dati
coerenti tra annunci, utenti e offerte.

I file JSON sono adeguati a un progetto didattico e a un singolo
processo Node.js. Documentare che non sono una soluzione adatta a un
servizio pubblico con molti utenti simultanei o più istanze server.

------------------------------------------------------------------------

## 7. Rotte HTTP suggerite

Organizzare le rotte con Express. È possibile adattare i nomi,
mantenendo le funzionalità.

### Autenticazione

-   `POST /api/register` --- registra un utente;
-   `POST /api/login` --- effettua il login;
-   `POST /api/logout` --- termina la sessione;
-   `GET /api/me` --- restituisce i dati pubblici dell'utente
    autenticato.

### Annunci

-   `GET /api/announcements` --- restituisce gli annunci attivi;
-   `GET /api/announcements/:id` --- dettaglio di un annuncio;
-   `POST /api/announcements` --- crea un annuncio;
-   `PUT /api/announcements/:id` --- modifica un proprio annuncio;
-   `DELETE /api/announcements/:id` --- elimina o disattiva un proprio
    annuncio.

### Offerte

-   `GET /api/offers/received` --- offerte ricevute;
-   `GET /api/offers/sent` --- offerte inviate;
-   `POST /api/offers` --- crea una nuova offerta o richiesta di
    acquisto;
-   `POST /api/offers/:id/counter` --- invia una controfferta;
-   `POST /api/offers/:id/accept` --- accetta la proposta corrente;
-   `POST /api/offers/:id/reject` --- rifiuta la proposta corrente;
-   `GET /api/offers/:id` --- dettaglio e storico della trattativa.

### Notifiche

-   `GET /api/notifications` --- notifiche dell'utente autenticato;
-   `POST /api/notifications/:id/read` --- segna una notifica come
    letta.

Per tutte le rotte riservate, verificare la sessione e i permessi lato
server. Non fidarsi di ID, prezzi, ruoli o proprietari forniti dal
client.

------------------------------------------------------------------------

## 8. Interfaccia grafica e UX

### 8.1 Stile

Realizzare un'interfaccia moderna, ordinata, responsive e intuitiva
usando Bootstrap 5.

Indicazioni: - navbar chiara e riconoscibile; - palette ispirata al
Piemonte, senza eccedere con i colori; - logo testuale Piemarket; - card
annuncio uniformi; - modal Bootstrap per pubblicazione e dettaglio; -
form con etichette e messaggi di errore comprensibili; - badge per stati
e notifiche; - layout utilizzabile da desktop e smartphone.

Non creare una semplice pagina scolastica spoglia: l'obiettivo è un
piccolo marketplace credibile e gradevole.

### 8.2 Feedback all'utente

Ogni operazione deve produrre un feedback: - caricamento durante
l'invio; - messaggio di successo; - messaggio di errore; - conferma
prima di eliminare un annuncio; - stato della connessione WebSocket; -
notifica quando arriva una nuova offerta.

Evitare `alert()` del browser per ogni operazione: preferire Bootstrap
Toast, Alert e Modal.

### 8.3 Sicurezza del frontend

-   Non inserire contenuti degli utenti in `innerHTML` senza
    sanitizzazione.
-   Preferire `textContent` per visualizzare titoli, descrizioni,
    messaggi e nickname.
-   Validare i form nel browser per comodità, ma ripetere sempre i
    controlli sul server.
-   Non mostrare dati privati degli utenti.
-   Non inserire password o hash nel frontend.

------------------------------------------------------------------------

## 9. Sicurezza e regole di business

Anche se è un progetto scolastico, applicare almeno queste protezioni:

1.  Password salvate esclusivamente come hash.
2.  Controllo server-side della regione Piemonte.
3.  Sessioni autenticate per HTTP e WebSocket.
4.  Controllo della proprietà degli annunci.
5.  Controllo che un utente non possa fare offerte sui propri annunci.
6.  Controllo che soltanto il destinatario della proposta possa
    accettarla o rifiutarla.
7.  Validazione di prezzi, testi, immagini e ID.
8.  Limite alla dimensione e ai tipi MIME delle immagini caricate.
9.  Nomi dei file caricati generati dal server, non scelti liberamente
    dall'utente.
10. Nessuna esposizione di email, password o dati di sessione.
11. Gestione di input non validi e messaggi WebSocket malformati.
12. Nessun pagamento reale e nessuna raccolta di dati bancari.

Per un marketplace rivolto a persone reali, prevedere anche segnalazione
degli annunci e degli utenti, moderazione e regole d'uso. Non pubblicare
indirizzi di casa o numeri di telefono in chiaro negli annunci.
Ricordare agli utenti di prestare attenzione negli eventuali scambi dal
vivo.

------------------------------------------------------------------------

## 10. Concetti didattici da evidenziare nei commenti

La consegna richiede che le conoscenze studiate siano evidenziate con
commenti nel codice. Inserire commenti didattici **nei punti in cui i
concetti vengono effettivamente utilizzati**, non commenti generici o
ripetuti senza utilità.

Usare commenti chiari, ad esempio:

``` js
// NODE.JS: importazione di moduli core tramite require().
const fs = require('fs');
const http = require('http');

// EXPRESS: creazione dell'applicazione e registrazione di middleware.
const app = express();

// HTTP: creazione del server HTTP a partire dall'app Express.
const server = http.createServer(app);

// WEBSOCKET: il server ws condivide la porta del server HTTP.
const { Server } = require('ws');
const ws_server = new Server({ server, path: '/ws' });
```

### 10.1 Concetti da includere, quando pertinenti

  -----------------------------------------------------------------------
  Concetto studiato                   Dove evidenziarlo
  ----------------------------------- -----------------------------------
  `require()` e CommonJS              Import dei moduli

  Destructuring (`{ Server }`)        Import di `ws`

  `__dirname`                         Percorsi dei file e delle cartelle

  `http.createServer()`               Creazione del server condiviso

  `express()`                         Creazione dell'app Express

  `.use()`                            Middleware

  `res.sendFile()`                    Invio delle pagine HTML

  `app.get()` / `app.post()`          Rotte HTTP

  `fs`                                Lettura e scrittura dei JSON

  `JSON.parse()`                      Conversione JSON in oggetti

  `JSON.stringify()`                  Conversione oggetti in JSON

  `setInterval()`                     Eventuali aggiornamenti periodici,
                                      se utili

  `Math.random()` / `Math.floor()`    Eventuale generazione di ID, solo
                                      se appropriata

  `parseInt()`                        Conversione di valori numerici
                                      ricevuti da form, se necessario

  Array e `forEach()`                 Iterazione su annunci, offerte e
                                      connessioni

  `push()`                            Aggiunta di elementi ai dati
                                      caricati

  `splice()`                          Rimozione di elementi dagli array
                                      in memoria, se utilizzata

  Oggetti letterali                   Struttura dei dati e messaggi JSON

  `server.listen()`                   Avvio del server

  `new Server({ server })`            Creazione del server WebSocket

  Evento `connection`                 Nuova connessione client

  Evento `message`                    Ricezione messaggi client

  Evento `close`                      Disconnessione

  `ws.send()` / `client.send()`       Invio messaggi

  `ws_server.clients`                 Broadcast

  `ws.id` o `ws.userId`               Identificazione della connessione

  `new WebSocket(url)`                Connessione lato browser

  `onmessage`                         Ricezione lato browser

  `webSocket.send()`                  Invio lato browser

  `JSON.parse(event.data)`            Lettura dei messaggi ricevuti

  `JSON.stringify()`                  Invio dei messaggi

  DOM: `getElementById()`             Recupero elementi

  DOM: `createElement()`              Creazione dinamica delle
                                      card/notifiche

  DOM: `appendChild()`                Inserimento elementi

  DOM: `addEventListener()`           Gestione delle interazioni
  -----------------------------------------------------------------------

**Non inserire concetti artificialmente solo per farli comparire.** Per
esempio, non usare variabili globali implicite: sono una pratica da
evitare, non un requisito da riprodurre. `fs.exists()` è deprecato: non
usarlo in nuovo codice; se necessario, spiegare nel README che è stato
studiato ma sostituito da un metodo moderno.

### 10.2 Commenti WebSocket particolarmente importanti

Nei file WebSocket spiegare: - perché il server HTTP viene condiviso con
WebSocket; - differenza tra richiesta HTTP e connessione WebSocket
persistente; - significato degli eventi `connection`, `message` e
`close`; - differenza tra broadcast e invio mirato; - struttura del
protocollo JSON; - come viene associato un client al suo utente; -
perché il server deve validare i messaggi ricevuti.

------------------------------------------------------------------------

## 11. Requisiti minimi di completamento

L'applicazione può considerarsi completa quando sono verificabili tutti
questi punti:

### Registrazione e accesso

-   [ ] Registrazione con i cinque campi richiesti.
-   [ ] Registrazione consentita soltanto con regione Piemonte.
-   [ ] Email univoca.
-   [ ] Password e conferma confrontate.
-   [ ] Password salvata come hash.
-   [ ] Login e Logout funzionanti.

### Annunci

-   [ ] Home con elenco annunci.
-   [ ] Pubblicazione tramite modal.
-   [ ] Upload immagine.
-   [ ] Prezzo zero visualizzato come Gratis.
-   [ ] Modal con dettagli dell'annuncio.
-   [ ] Modifica ed eliminazione dei propri annunci.
-   [ ] Aggiornamento della bacheca senza refresh tramite WebSocket.

### Offerte

-   [ ] Possibilità di inviare un'offerta.
-   [ ] Sezione offerte ricevute.
-   [ ] Sezione offerte inviate.
-   [ ] Accettazione e rifiuto.
-   [ ] Controfferte.
-   [ ] Storico completo delle proposte.
-   [ ] Aggiornamento in tempo reale tramite WebSocket.
-   [ ] Notifiche persistenti per utenti offline.

### Tecnologie e consegna

-   [ ] Express e Node.js utilizzati.
-   [ ] Modulo `ws` effettivamente utilizzato.
-   [ ] Client e server WebSocket funzionanti.
-   [ ] Broadcast e invio mirato.
-   [ ] JSON usati per la persistenza.
-   [ ] `fs` utilizzato per leggere/scrivere i dati.
-   [ ] Commenti didattici sui concetti studiati.
-   [ ] README con istruzioni di installazione e avvio.
-   [ ] Nessun errore critico in console.

------------------------------------------------------------------------

## 12. Piano di sviluppo consigliato

Non generare tutta l'applicazione in un unico blocco senza verifiche.
Procedere per fasi, mantenendo il progetto avviabile a ogni passaggio.

### Fase 1 --- Struttura e server

-   Creare cartelle e file.
-   Inizializzare `package.json`.
-   Configurare Express.
-   Creare il server HTTP.
-   Collegare `ws`.
-   Servire le pagine statiche.
-   Verificare connessione e disconnessione WebSocket con due browser.

### Fase 2 --- JSON e autenticazione

-   Creare i file JSON iniziali.
-   Implementare il servizio centralizzato di persistenza.
-   Implementare registrazione e controllo Piemonte.
-   Implementare login, sessione e logout.
-   Verificare che le rotte riservate non siano accessibili senza
    autenticazione.

### Fase 3 --- Annunci

-   Realizzare Home e card.
-   Implementare upload immagini.
-   Implementare pubblicazione.
-   Implementare modal di dettaglio.
-   Implementare modifica ed eliminazione.
-   Aggiungere broadcast WebSocket per i nuovi annunci.

### Fase 4 --- Offerte

-   Implementare richiesta di acquisto.
-   Implementare nuova offerta.
-   Implementare controfferta.
-   Implementare accettazione e rifiuto.
-   Salvare lo storico in JSON.
-   Verificare tutte le transizioni di stato.

### Fase 5 --- WebSocket e notifiche

-   Associare le connessioni agli utenti autenticati.
-   Implementare broadcast generale.
-   Implementare invio mirato.
-   Notificare le nuove offerte e le controfferte.
-   Aggiornare badge e schermate senza refresh.
-   Gestire riconnessione e utenti offline.

### Fase 6 --- Rifinitura e verifica

-   Migliorare grafica responsive.
-   Aggiungere ricerca e ordinamento.
-   Controllare validazioni e permessi.
-   Provare con almeno due utenti e due browser distinti.
-   Verificare persistenza dopo riavvio del server.
-   Completare commenti didattici e README.

------------------------------------------------------------------------

## 13. Scenari di test obbligatori

Testare manualmente almeno questi scenari:

1.  Un utente seleziona Lombardia e prova a registrarsi: il server
    rifiuta la registrazione.
2.  Un utente piemontese si registra e accede.
3.  L'utente A pubblica un annuncio.
4.  L'utente B, già collegato, vede il nuovo annuncio senza ricaricare
    la pagina.
5.  B apre il dettaglio e invia un'offerta.
6.  A riceve in tempo reale la notifica e vede l'offerta in Offerte
    ricevute.
7.  A invia una controfferta.
8.  B la vede in tempo reale in Offerte inviate.
9.  B accetta la controfferta.
10. Entrambi vedono la trattativa conclusa.
11. Un utente prova a modificare l'annuncio di un altro: il server
    rifiuta.
12. Un utente prova a fare un'offerta sul proprio annuncio: il server
    rifiuta.
13. Un utente si disconnette, riceve un'offerta mentre è offline e la
    vede al successivo accesso.
14. Il server viene riavviato: utenti, annunci e trattative salvati nei
    JSON sono ancora presenti.

------------------------------------------------------------------------

## 14. Istruzioni finali per l'IA sviluppatrice

Prima di implementare:

1.  Analizza questa specifica e individua eventuali ambiguità.
2.  Proponi una struttura definitiva dei file.
3.  Descrivi brevemente il flusso HTTP, il flusso WebSocket e il formato
    dei JSON.
4.  Evidenzia quali dipendenze aggiuntive intendi usare e perché.
5.  Procedi per fasi, senza saltare direttamente a una soluzione
    monolitica.

Durante lo sviluppo:

-   Scrivi codice completo e realmente eseguibile, non pseudocodice.
-   Mantieni nomi coerenti per variabili, eventi, rotte e campi JSON.
-   Non duplicare la logica di accesso ai file.
-   Non fidarti dei dati inviati dal client.
-   Non usare Socket.IO al posto di `ws`.
-   Non sostituire i file JSON con un database.
-   Non simulare WebSocket con polling HTTP.
-   Non usare WebSocket soltanto per una demo: deve gestire davvero
    aggiornamenti di annunci, offerte e notifiche.
-   Inserisci commenti didattici chiari sui concetti studiati.
-   Se una funzionalità non è ancora implementata, dichiararlo
    esplicitamente: non lasciare pulsanti finti o azioni che sembrano
    funzionare ma non fanno nulla.
-   Dopo ogni fase, indicare i file creati/modificati e i comandi per
    avviare e testare l'applicazione.

**Risultato atteso:** un marketplace regionale chiamato Piemarket,
funzionante e responsive, con registrazione riservata al Piemonte,
annunci persistenti su file JSON, trattative con offerte e controfferte
e comunicazione WebSocket bidirezionale tramite il pacchetto `ws`,
documentata nel codice per soddisfare la consegna scolastica.
