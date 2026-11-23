# PIEMARKET — Mercato ad Asta del Piemonte (TPSIT)

Piattaforma didattica web per la compravendita regionale esclusiva per il **Piemonte**, trasformata in un **mercato ad asta in tempo reale**.

---

## 1. Funzionalità Principali

- **Mercato ad Asta con Timer**:
  - Ogni utente piemontese può creare un'asta impostando titolo, descrizione, immagine, prezzo base e **durata del timer** (in minuti);
  - Il tempo rimanente scorre con un **conto alla rovescia in diretta** su ciascuna card dell'asta;
- **Rilanci Rapidi e Offerte Personalizzate**:
  - Gli utenti possono rilanciare immediatamente con i pulsanti rapidi **+1 €** e **+5 €**, oppure inserire una cifra libera superiore all'offerta corrente;
  - Il proprietario dell'asta non può fare offerte sui propri oggetti;
- **Sincronizzazione Live via WebSocket (`ws`)**:
  - Ogni volta che un utente rilancia, la cifra e il miglior offerente si aggiornano istantaneamente sugli schermi di tutti gli altri utenti connessi senza ricaricare la pagina;
  - Alla scadenza del timer, l'asta si chiude automaticamente proclamando il vincitore;
- **Interfaccia Semplificata**:
  - Rimossa la barra di ricerca e i filtri prezzo per focalizzare la bacheca sulle aste attive;
  - Nessuna notifica invasiva a comparsa;
  - Footer pulito con la dicitura `Piemarket 2026`;
- **Architettura Didattica Semplice**:
  - Tutto il backend unificato in [server.js](file:///home/mattia/Documenti/TPSIT/server.js);
  - Tutto il client unificato in [public/js/client.js](file:///home/mattia/Documenti/TPSIT/public/js/client.js);
  - Autenticazione con `localStorage` e header `x-user-id` (senza complessità di cookie o hashing);
  - Persistenza su file JSON in `data/users.json` e `data/announcements.json`.

---

## 2. Installazione e Avvio

1. Installazione dipendenze:
   ```bash
   npm install
   ```

2. Avvio dell'applicazione:
   ```bash
   npm start
   ```
   Raggiungibile all'indirizzo: `http://localhost:3000`.

3. Esecuzione dei test automatici:
   ```bash
   npm test
   ```
