# E1 Direktvertrieb

Website, Vertriebsportal und Feld-App für E1 Direktvertrieb.

- Portal: Aufträge, Provisionen, Gebiete, Postfach
- Feld-App: `/app` — Heute, Karte, Wochenliste (iPhone/Android Home-Bildschirm)
- Mails: Google Workspace (`e1direktvertrieb.de`)
- Hosting: Render (Frankfurt), Postgres

## Render

1. New → Blueprint (diese `render.yaml`) oder Web Service + Postgres in Frankfurt
2. Build: `npm install && npm run build`
3. Start: `npm run db:migrate && npm start`
4. Env: siehe `.env.example`

Erster Login unter `/login` wird Super-Admin.

## Lokal

```
npm install
npm run dev
```
