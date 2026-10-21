# Запуск и поставка BI Academy

**Изменение 18.10.2026: добавлены аккаунты и серверная SQLite.** Инструкции ниже до этого обновления описывают статическую версию. Для текущего приложения обязательны persistent storage `/app/data`, `DATABASE_PATH=/app/data/academy.sqlite` и `COOKIE_SECURE=true` на HTTPS. Compose уже содержит том `academy-data`. Подробная актуальная инструкция: [регистрация и хранение](auth.md).

**Банк вопросов:** при каждом старте API рабочая таблица `question_bank` автоматически сверяется с файлами поставляемой версии. Новые вопросы добавляются, изменения применяются, удалённые ID деактивируются. Для доставки изменённых файлов выполните rebuild/redeploy приложения с сохранением `/app/data`; restart прежнего образа использует прежние вопросы. Аккаунты и снимки попыток сохраняются в существующей SQLite. Источники и правила синхронизации описаны в [банке вопросов](../question-bank.md).

За reverse proxy рекомендуется задать `PUBLIC_ORIGIN=https://ваш-домен` (без пути), чтобы проверка источника учитывала внешний адрес даже при замене Host и отсутствии Fetch Metadata. После изменения переменных перезапустить приложение; после изменения кода — пересобрать образ. Это устраняет ошибку «Источник запроса не разрешён.» при регистрации и входе за прокси. Локальный Vite уже сохраняет Host через `changeOrigin: false`, дополнительная переменная для `localhost:5173` не требуется.

Обновление оформления 17.10: актуальный синий source — e149599. Node/check/155/36 E2E и responsive проверены, материалы обновлены. Попытка пересобрать Docker не завершилась из-за заполнения C и падения dockerd, поэтому контейнерные проверки новой темы не засчитаны. Все архивы ниже относятся к предыдущей зелёной версии; перед публичным запуском собрать синий образ из main после освобождения места/на Coolify и выполнить обычные health/HTTP/browser проверки. Образы, volumes и пользовательские файлы для освобождения места не удалялись.

Подготовлено A для D1-08, обновлено 17.10.2026 после интеграции B/C и истории (a2cf3d9). Публичное приложение пока не создавалось и не публиковалось: доступ к Coolify владелец предоставит отдельно. Реальное прохождение проверено на production Node и Docker; локальный Engine восстановлен без сброса пользовательских данных.

## Production без Docker

Node 24.13.1 / npm 11.8.0, чистая установка из lock-файла:

```sh
npm ci
npm run check
npm start
```

Сервер слушает `0.0.0.0:3000`, проверка — http://localhost:3000/healthz, результат `{"status":"ok"}`. `PORT` можно изменить через переменную окружения (целое 1–65535); для проекта согласован порт 3000. Сервер отказывается запускаться без `dist/index.html`; `vite preview` не используется в production.

## Локальный Docker

Запустить Docker Desktop с Linux containers / Docker Engine и проверить `docker version` (должны быть Client и Server). Из корня:

```sh
docker compose config --quiet
docker compose up --build --wait --wait-timeout 120
docker compose ps
npm run test:http
npm run test:e2e:container
docker compose restart
docker compose up --wait --wait-timeout 120
npm run test:http
docker compose down
```

Открыть http://localhost:3000, проверить обновление `/intro`, `/assessment`, `/results`, `/development`. Без завершённой попытки профиль/маршрут показывают приглашение пройти тест. `test:http` проверяет health, все HTML-маршруты, настоящие JS/CSS сборки и 404 отсутствующих ресурсов. Сервер не подменяет отсутствующий JS/CSS HTML-документом; SPA fallback разрешён только для GET/HEAD с явным Accept: text/html и без пути к файлу/API. Кеш index — с перепроверкой, хешированные assets — immutable.

Если сборка или health не прошли: `docker compose logs academy`, затем `docker compose down`. Если порт занят, остановить известный локальный процесс или согласовать другой внешний порт в compose. `test:e2e` сам запускает Node на 3000 и выполняется отдельно от compose. `test:e2e:container` использует тот же набор тестов, но не запускает сервер; перед ним нужны healthy compose и установленные браузеры (`npx playwright install chromium firefox`). Этот режим также добавлен в container job CI; удалённый результат Actions проверяется отдельно.

Образ multi-stage: builder выполняет `npm ci`/проверку типов/сборку; runtime устанавливает только production dependencies, копирует dist и три файла сервера. Базовый образ закреплён `node:24.13.1-bookworm-slim`, процесс работает как `node`. Compose включает read-only filesystem, init и корректное завершение. Персональные данные сервер не принимает. БД, persistent volumes и ключи API не нужны.

## Coolify после предоставления доступа

Инструкция основана на [Dockerfile deployment](https://coolify.io/docs/applications/builds/dockerfile) и [Health checks](https://coolify.io/docs/applications/configuration/health-checks). Названия полей сверить с доступной версией панели.

1. Создать Application из Git-репозитория `https://github.com/Left2Bad/Bi-Group-Game`. Для private repository предоставить Coolify доступ через его GitHub integration / deploy key.
2. Выбрать `main` и зафиксировать проверенный commit. Блоки `feat/d1-foundation` и `feat/d1-shell-server` перенесены в main; дальнейшая работа последовательная, обязательное взаимное ревью отменено владельцем.
3. Build Pack: Dockerfile. Base Directory: `/`, Dockerfile Location: `/Dockerfile` (если поле требует относительный путь — `Dockerfile`), build context — корень репозитория. `compose.yaml` оставляем для локальной проверки; в панели используем Dockerfile application.
4. Ports Exposes: `3000`; процесс слушает `0.0.0.0`. Runtime environment: `NODE_ENV=production`, `PORT=3000`. Собственные build/start-команды не нужны: их задаёт Dockerfile. Для домена настроить DNS на сервер и HTTPS в Coolify.
5. Образ уже содержит `HEALTHCHECK`, выполняющий `node server/healthcheck.mjs` на `/healthz`; curl/wget не требуются. Coolify для Dockerfile application использует image healthcheck. Если требуется настройка в панели, выбрать CMD с той же Node-командой и сверить приоритет с версией панели.
6. После разрешённого владельцем deploy проверить build/runtime logs, container health, публичный HTTPS `/healthz`, загрузку JS/CSS, переходы и reload вложенных адресов. Пройти 15 настоящих вопросов → профиль → рекомендации в отчёте → печать; выполнить reload на вопросе и на профиле. Записать URL, commit, время и реальные результаты в handoff/QA.

Не помещать секреты в `VITE_*`: эти значения доступны браузеру. В этой версии внешних API нет.

## Откат и резерв

Перед публикацией записать commit кандидата и предыдущей проверенной версии/образа. Откат — повторный deploy предыдущего commit/образа и повторная проверка health + сценария. До первого успешного deploy предыдущей версии нет; не утверждать, что откат уже проверен.

Локальный резерв после успешной контейнерной проверки: `docker image save bi-academy:local -o bi-academy-local.tar` вне Git. На другой машине: `docker load -i bi-academy-local.tar`, затем `docker run --rm --init -p 127.0.0.1:3000:3000 bi-academy:local`. Образ пересобран и проверен 17.10 с настоящими B/C и историей; это промежуточная версия, для защиты повторить после готовности оставшихся экранов и фиксации финального commit.

### Предыдущий проверенный резерв B/C (зелёное оформление)

Проверенный код: `abfb8298947d394cdaa40abcd4cb17eb4b34a4ff`. Image ID: `sha256:12a2650135f007356121dfcb0846f3bafb6930511496b75407336c92bafed59a`, тег `bi-academy:verified-abfb829`. Архив в корне рабочего проекта A — `bi-academy-abfb829.tar`, 83 140 608 байт, вне Git. SHA256: `5EB1FA49BD4448E4B35FECA45F069944A3FC10034D0297808C0FD17457674539`.

```sh
docker load -i bi-academy-abfb829.tar
docker run --rm --init --read-only --cap-drop ALL --security-opt no-new-privileges:true -p 127.0.0.1:3000:3000 bi-academy:verified-abfb829
```

17.10 проверены Docker build/healthy, HTTP/семь HTML/MIME/404, 36/36 browser-сценариев Chromium desktop/mobile viewport/Firefox, restart/HTTP, stop exit=0/down. После экспорта по абсолютному --output отдельно выполнены load → запуск версионного тега → healthy → HTTP → stop exit=0/oomKilled=false; проверочный контейнер удалён. В архиве есть /demo, остальные функции B/A и настоящая методика C. Резерв не требует GitHub/npm для повторного запуска уже загруженного образа. Проверка checksum: Get-FileHash на Windows или sha256sum на Linux. Публичный Coolify и запуск на другом компьютере этим не подтверждены; перед конечной сдачей сверить final release.

### Предыдущий резерв с экранами B (без отдельного Демо)

Проверенный код: `07ff61bce1e1ed6cccd8834cec57de5ec48f5dfa`. Production image ID: `sha256:2c5f999df1e13a22ab2fa20b17a9012bffc5926ffd80b7152fc0326c76ce92a0`, тег `bi-academy:verified-07ff61b`. Файл в корне рабочего проекта A — `bi-academy-07ff61b.tar`, 83 139 072 байта, вне Git. SHA256: `E5E51BB68BE3CABD3784FF4FD4B96801013C2AA4F9CB443745EAB1C0E6B25E4D`.

```sh
docker load -i bi-academy-07ff61b.tar
docker run --rm --init --read-only --cap-drop ALL --security-opt no-new-privileges:true -p 127.0.0.1:3000:3000 bi-academy:verified-07ff61b
```

17.10 образ пересобран после профиля/маршрута B: healthy, HTTP, 27/27 browser-сценариев Chromium desktop/mobile/Firefox (включая полный keyboard), restart/HTTP, stop exit=0 и down. Архив затем отдельно загружен и запущен до healthy/HTTP; контейнер проверки остановлен. В архиве есть объяснения/опоры/marks. Это предыдущая версия без отдельного Демо C, она сохранена для сравнения/отката; для текущего показа использовать abfb829 выше.

### Предыдущий локальный резерв 4cb0f50

Исходники: GitHub commit `4cb0f501452024dacc8d7047c40e632b5dc1da03`, отдельный чистый clone. Архив в корне рабочего проекта — `bi-academy-4cb0f50.tar`, 83 134 976 байт, Git его игнорирует. Тег `bi-academy:verified-4cb0f50` сохранён отдельно от изменяемого `:local`. Image ID: `sha256:7528d3f469da3159c9d338fef1bc68e76cf1d10e26854fecc457ebf283fc20b5`.

SHA256 архива: `C676F2903365C47B180BC30364BE289145C3CEE65BA7B221E0E8D2F03EF15BFE`. На Windows сверить через `Get-FileHash bi-academy-4cb0f50.tar -Algorithm SHA256`, на Linux — `sha256sum bi-academy-4cb0f50.tar`. Для запуска нужен Docker с Linux containers:

```sh
docker load -i bi-academy-4cb0f50.tar
docker run --rm --init --read-only --cap-drop ALL --security-opt no-new-privileges:true -p 127.0.0.1:3000:3000 bi-academy:verified-4cb0f50
```

Проверены именно экспорт → docker load → запуск версионного тега → healthy → HTTP smoke; проверочный контейнер остановлен. Установленный локальный образ не требует GitHub/npm для повторного запуска. Это резерв промежуточной версии: экран маршрута/отметки/объяснения B и отдельное Демо C ещё не завершены. Архив после финальных изменений пересоздать и снова проверить; D5-05 целиком пока открыт. Публичный HTTPS/Coolify и запуск на другой машине этим не подтверждены.

## Восстановление локального Docker 17.10

Первоначально Desktop 4.61.0 не поднял Engine: `initializing Inference manager ... dockerInference ... The file cannot be accessed by the system` (Windows 1920). Удаление/переименование отдельного сокета не помогло. После остановки Docker и только WSL-дистрибутива docker-desktop папка `C:\Users\langos\AppData\Local\Docker\run` с двумя пустыми сокетами сохранена как `run.stale-20261017`. Затем выявлен аналогичный старый `C:\Users\langos\AppData\Local\docker-secrets-engine\engine.sock`: папка содержала только этот пустой сокет и сохранена как `docker-secrets-engine.stale-20261017`. Повторный неудачный запуск оставил новый inference-сокет, его runtime-папка также сохранена как `Docker\run.stale-20261017-retry`. При согласованном старте с обеими новыми папками Engine 29.2.1 запустился. Backup-папки оставлены на месте; содержимое секретов не читалось, настройки, образы, volumes и другие WSL-дистрибутивы не сбрасывались. Это локально проверенное восстановление, не инструкция массового удаления каталогов. Сходные симптомы описаны в [issue Docker](https://github.com/docker/desktop-feedback/issues/448).

Первая сборка прошла npm ci/typecheck/Vite, но экспорт образа завершился `parent snapshot ... does not exist`. Повтор `docker compose build --no-cache` успешно собрал/распаковал образ; cache и другие образы не очищались. Возможен сходный [сбой BuildKit/containerd](https://github.com/moby/buildkit/issues/6521); точная причина на этой машине не доказана. Затем прошли up/health, HTTP, 16 browser-тестов, restart/HTTP, stop с exit=0/oomKilled=false и down. Исходный инфраструктурный блокер D4-05 снят; доступ к публичному Coolify всё ещё ожидается.

Повтор в следующей сессии 17.10: Desktop вновь упал на этих же нулевых сокетах. После проверки отсутствия Docker-процессов и состава двух runtime-папок они сохранены как Docker/run.stale-20261017-session2 и docker-secrets-engine.stale-20261017-session2, остановлен только WSL docker-desktop, обе папки обновлены совместно. Engine 29.2.1 восстановлен, Linux check чистого clone 062d51e прошёл 155 тестов/typecheck/build без сети и mounts. Это повторяющийся дефект локального Desktop, а не исправление его первопричины; factory reset, удаление образов/volumes/настроек не применялись. Не использовать старые socket-папки повторно.
