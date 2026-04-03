# Tamir Balkan (monorepo)

## One-command запуск (Windows/macOS/Linux)

В корне проекта:

```bash
npm install
npm run dev
```

Что делает `npm run dev`:

- освобождает порты **3000** и **9000** (если остался старый Next/Medusa — иначе будет «Another next dev server is already running»)
- поднимает инфраструктуру `docker compose up -d --remove-orphans` (Postgres + Redis; старые лишние контейнеры compose удаляются)
- запускает параллельно:
  - Medusa backend: `backend` (по умолчанию `http://localhost:9000`)
  - Next.js storefront: `frontend` (по умолчанию `http://localhost:3000`)

Остановить инфраструктуру:

```bash
npm run stop
```

## URL

- витрина: `http://localhost:3000`
- бэкенд: `http://localhost:9000` (админка обычно `http://localhost:9000/app`)

