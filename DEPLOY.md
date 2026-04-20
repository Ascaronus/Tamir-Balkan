# Деплой на VPS (SSH, фронт, бэк)

Пути по умолчанию: `/root/tamir_balkan`. Подставь свой IP, пользователя и каталог при необходимости.

## Подключение по SSH

```bash
ssh root@178.104.108.200
```

С ключом:

```bash
ssh -i путь/к/ключу.pem root@178.104.108.200
```

## Залить новые файлы на сервер

### Через Git

На своей машине: `git commit` и `git push`. На сервере:

```bash
cd /root/tamir_balkan
git pull
```

### Через scp (с ПК, пример)

Папка:

```bash
scp -r D:\tamir_balkan\frontend\src root@178.104.108.200:/root/tamir_balkan/frontend/
```

Один файл:

```bash
scp D:\tamir_balkan\frontend\next.config.ts root@178.104.108.200:/root/tamir_balkan/frontend/
```

Можно использовать WinSCP / FileZilla по SFTP.

## Перезапуск фронта (Next.js)

```bash
cd /root/tamir_balkan/frontend
npm run build
npm run start
```

Если процесс уже в этом терминале — остановить `Ctrl+C`, затем снова `npm run start`.

С pm2 (имя процесса смотри в `pm2 list`):

```bash
cd /root/tamir_balkan/frontend
npm run build
pm2 restart tamir-frontend
```

## Перезапуск бэкенда (Medusa)

```bash
cd /root/tamir_balkan/backend
npm run build
npm run start
```

После изменений в `backend/.env` при необходимости скопировать в runtime:

```bash
cp /root/tamir_balkan/backend/.env /root/tamir_balkan/backend/.medusa/server/.env.production
```

## Порт занят (EADDRINUSE)

```bash
ss -tlnp | grep 3000
ss -tlnp | grep 9000
```

Освободить порт (осторожно — завершит всё, что слушает порт):

```bash
fuser -k 3000/tcp
fuser -k 9000/tcp
```

## Краткий порядок обновления

1. `ssh` на сервер  
2. `git pull` или залить файлы через scp/SFTP  
3. Фронт: `cd frontend && npm run build && npm run start`  
4. Бэк: `cd backend && npm run build && npm run start` (если менялся бэкенд)

---

## Чтобы сервер не «выключался» после закрытия SSH

Закрытие **PowerShell на твоём ПК** не трогает VPS. Проблема в том, что процесс, запущенный **в SSH-сессии** (`npm run start` в открытом терминале), часто **умирает при разрыве SSH**.

Нужно запускать фронт и бэк через **менеджер процессов** (рекомендуется **PM2**) или **systemd**, и включить автозапуск после перезагрузки VPS.

### Вариант 1: PM2 (удобно для Node)

Один раз на сервере:

```bash
npm install -g pm2
```

Останови старые ручные `npm run start` (Ctrl+C или `fuser -k 3000/tcp` / `9000/tcp`).

**Фронт** (порт 3000):

```bash
cd /root/tamir_balkan/frontend
npm run build
pm2 start npm --name "tamir-frontend" -- run start
```

**Бэк** (порт 9000):

```bash
cd /root/tamir_balkan/backend
npm run build
pm2 start npm --name "tamir-backend" -- run start
```

Сохранить список и включить автозапуск при перезагрузке:

```bash
pm2 save
pm2 startup
```

Выполни ту строку, которую выведет `pm2 startup` (часто `sudo env PATH=...`).

Полезные команды:

```bash
pm2 list
pm2 logs tamir-frontend
pm2 restart tamir-frontend
pm2 restart tamir-backend
```

После деплоя: `npm run build` в нужной папке, затем `pm2 restart <имя>`.

### PM2 — пошагово (первый раз)

1. Подключись по SSH к серверу.
2. Установи PM2: `npm install -g pm2`
3. Останови процессы на портах **3000** и **9000**, если уже что-то запущено: `fuser -k 3000/tcp` и `fuser -k 9000/tcp` (или `ss -tlnp | grep -E '3000|9000'`).
4. **Фронт:**
   ```bash
   cd /root/tamir_balkan/frontend
   npm run build
   pm2 start npm --name "tamir-frontend" -- run start
   ```
5. **Бэк:**
   ```bash
   cd /root/tamir_balkan/backend
   npm run build
   pm2 start npm --name "tamir-backend" -- run start
   ```
6. Проверка: `pm2 list` — оба процесса **online**.
7. Автозапуск после перезагрузки VPS: `pm2 save`, затем `pm2 startup` и выполни одну команду, которую выведет `pm2 startup` (часто с `sudo`).

Если имя уже занято: `pm2 delete tamir-frontend` или `pm2 delete tamir-backend`, потом снова `pm2 start ...`.

После обновления кода: `git pull` → `npm run build` в нужной папке → `pm2 restart tamir-frontend` и/или `pm2 restart tamir-backend`.

### Вариант 2: systemd

Создаёшь два unit-файла в `/etc/systemd/system/` с `WorkingDirectory`, `ExecStart=/usr/bin/npm run start`, `Restart=always`, пользователь `root` или отдельный пользователь. Затем:

```bash
sudo systemctl enable tamir-frontend tamir-backend
sudo systemctl start tamir-frontend tamir-backend
```

Точные unit-файлы зависят от путей к `node`/`npm` — PM2 проще для старта.

### Вариант 3: только «не рвать» сессию (временно)

```bash
apt install -y screen
screen -S shop
# внутри: npm run start
# отсоединиться: Ctrl+A, затем D
```

После перезагрузки VPS процессы всё равно не поднимутся — для постоянной работы нужен PM2 или systemd.


root
cbtKkmkJNken

полезное 
pm2 list
pm2 logs tamir-frontend
pm2 restart tamir-frontend
pm2 restart tamir-backend

cd /root/tamir_balkan/backend
npm install
npx medusa db:migrate
npm run store-locales
npm run build
pm2 restart tamir-backend
pm2 logs tamir-backend

**Короче (если только обновил код, без новых зависимостей/миграций/локалей):** из корня репо после `git pull` достаточно `npm run build` в `backend` и `pm2 restart tamir-backend`. `npm install` — когда менялся `package.json` / lock; `db:migrate` — когда подтянули миграции; `store-locales` — когда менялись переводы/скрипт локалей. `pm2 logs` — по желанию смотреть логи, к деплою не обязателен.

cd /root/tamir_balkan/backend
npm run build
pm2 restart tamir-backend


cd /root/tamir_balkan/frontend
npm install
npm run build
pm2 restart tamir-frontend
pm2 logs tamir-frontend

cd /root/tamir_balkan
git pull

cd /root/tamir_balkan/frontend
pm2 stop tamir-frontend
rm -rf .next
npm run build
pm2 restart tamir-frontend

cd /root/tamir_balkan/backend
export ROZETKA_XML_URL="https://tamir.ua/rozetka/"
export ROZETKA_STOCK_LOCATION_ID="sloc_XXXXXXXXXXXX"
export GOOGLE_TRANSLATE_API_KEY="YOUR_GOOGLE_KEY" # опционально: автоперевод title/description в EN/SR (sr-Latn)
npx medusa exec ./src/scripts/import-rozetka-xml.ts