# Redazione · Fuxia Magazine e Rete NeTVision

La redazione online delle due testate: articoli con stati (Bozza, In revisione, Da correggere, Pronto, Pubblicato), note e correzioni a margine, foto e gallerie, scadenze e assegnazioni, Riepilogo, Menabò ed Edizione per ciascuna testata. Si installa sul telefono come un'app.

## Com'è fatta

- **Sito statico** (HTML, CSS, JavaScript, nessuna compilazione) pubblicato su **Netlify**.
- **Supabase** conserva articoli, note, foto e gestisce gli accessi con email e password.
- I permessi veri stanno nel database (`supabase/schema.sql`): anche chi manomettesse la pagina non potrebbe pubblicare o cambiare ruoli senza essere direttore.

| File | A cosa serve |
|---|---|
| `index.html` | La pagina dell'app |
| `app.js` | Tutta la logica |
| `style.css` | Aspetto e colori (fucsia per Fuxia, blu e oro per RNV) |
| `config.js` | Indirizzo e chiave pubblica di Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installazione sul telefono |
| `img/` | Loghi e banner delle testate |
| `supabase/schema.sql` | Tabelle, ruoli e regole di accesso |

## Messa in funzione (una volta sola)

1. **Supabase → SQL Editor → New query**: incolla tutto `supabase/schema.sql` e premi **Run**. Si può rieseguire senza perdere dati.
2. **Supabase → Authentication → URL Configuration**: in *Site URL* metti l'indirizzo Netlify dell'app (es. `https://redazione-fuxia.netlify.app`) e aggiungilo anche in *Redirect URLs*.
3. **Supabase → Authentication → Sign In / Providers → Email**: consigliato spegnere *Confirm email*. L'accesso lo dà comunque il direttore, e il servizio email gratuito di Supabase manda poche email l'ora.
4. Copia in `config.js` il *Project URL* e la chiave *anon public* (Project Settings → API). **Mai** la chiave *service_role/secret*.
5. **Netlify → Add new site → Import from Git → GitHub** → scegli questo archivio. Lascia vuoto il comando di build, cartella di pubblicazione `.`.
6. La **prima persona che si iscrive diventa direttore**. Poi, dalla scheda **Squadra**, approva gli altri e sceglie i ruoli.

## Ruoli

- **In attesa**: appena iscritto, non vede nulla finché un direttore non lo approva.
- **Lettore**: vede tutto, non scrive.
- **Redattore**: scrive, corregge, lascia note, carica foto, gestisce scadenze dei propri pezzi.
- **Direttore**: in più pubblica e ritira, modifica i pubblicati, prepara il menabò, gestisce la squadra. Deve sempre restarne almeno uno.

## Installare sul telefono

- **Android (Chrome)**: apri il link, menu ⋮ → *Installa app* (o dal profilo nell'app, pulsante *Installa l'app*).
- **iPhone (Safari)**: apri il link, pulsante Condividi → *Aggiungi alla schermata Home*.

## Icona

L'icona attuale è la "R" fucsia su nero con linea oro e scritta REDAZIONE (icons/varianti/10.png). Le alternative sono in `icons/opt_fuxia.png` e `icons/opt_rnv.png`: per cambiarla vanno rigenerati `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` dall'opzione scelta.

## Note per chi modifica il codice (anche Claude)

- Nessuna dipendenza da installare; `supabase-js` 2.45.4 arriva da jsDelivr.
- `app.js` disegna l'interfaccia con la funzione `h()`; ogni vista è una funzione `renderX()`. Lo stato è nell'oggetto `S`.
- Nel codice gli articoli usano nomi camelCase (`coverId`), nel database snake_case (`cover_id`): la conversione è in `artFromRow` / `artToRow` (mappa `A2R`).
- Aggiornamenti in tempo reale: canale Supabase su tutte le tabelle, che ricarica la tabella cambiata.
- Blocco di modifica: funzioni SQL `acquire_lock` / `release_lock` (45 secondi, rinnovato ogni 25).
- Se aggiungi un campo agli articoli: colonna in `schema.sql` (con `add column if not exists`), voce in `A2R` e in `artFromRow`.
- Dopo modifiche importanti a `app.js` o `style.css`, aumenta il numero in `CACHE` dentro `sw.js` così i telefoni scaricano la versione nuova.
