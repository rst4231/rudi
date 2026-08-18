# RUDI Repository Separation Design

## Goal

Полностью отделить `spb-daily-guide-bot` (RUDI) от `rst4231/botsandsite`, чтобы изменения RUDI не создавали deployments проекта `traffic-news-telegram-bot`, а изменения traffic-news не затрагивали RUDI.

## Target architecture

- `rst4231/botsandsite` обслуживает только Vercel-проект `traffic-news-telegram-bot` (`prj_oeVaHSb17REkd4rZGsJrRIybPRG7`).
- `rst4231/rudi` обслуживает только Vercel-проект `spb-daily-guide-bot` (`prj_tg663wlSXTaoE2HNfekiymY0IF63`).
- RUDI не загружает runtime, конфигурацию или код из `botsandsite` во время build/runtime.
- Для разделения больше не используются префикс коммитов `[rudi]`, `scripts/vercel-project-mode.cjs` или проверка `VERCEL_PROJECT_ID` между двумя приложениями.

## RUDI repository contents

В `rst4231/rudi` переносится заведомо рабочая recovery-сборка RUDI из `botsandsite/rudi-runtime-20260817`:

- runtime chunks `chunk0.txt` ... `chunk6.txt`;
- единый Vercel API entrypoint `api/index.js`;
- `package.json`;
- `vercel.json` с маршрутами `/api/daily`, `/api/health`, `/api/telegram`, `/api/alice-shopping`, `/api/init-products`, `/api/preview`;
- cron только RUDI: `/api/daily` в `30 21 * * *`.

`api/index.js` должен читать runtime chunks локально из собственного репозитория/деплой-пакета. Никаких `raw.githubusercontent.com/rst4231/botsandsite/...` зависимостей после миграции быть не должно.

## botsandsite cleanup

После подготовки и проверки нового RUDI из `rst4231/botsandsite` удаляются только RUDI-специфичные элементы:

- `api/rudi.js`;
- `rudi-runtime-20260817/`;
- `scripts/vercel-project-mode.cjs`;
- RUDI rewrites/functions/build branching из корневого `vercel.json`.

Корневой `vercel.json` после очистки должен относиться только к `traffic-news-telegram-bot` и сохранить его cron `/api/cron/publish` в `40 15 * * *`.

Traffic-news код, контент, Telegram/VK настройки и runtime при этой миграции не изменяются.

## Deployment policy

- Во время подготовки `rst4231/rudi` отключён от Git auto-deploy в Vercel.
- Никаких вызовов Vercel deploy в ходе миграции.
- Все изменения RUDI собираются до повторного подключения Git.
- Перед любым новым production deployment ассистент сообщает пользователю, что изменено, и отдельно спрашивает: **Деплоим?**
- Без явного подтверждения production deployment не запускается.

## Verification

До повторного подключения RUDI к Vercel необходимо проверить:

1. В `rst4231/rudi` нет ссылок на `rst4231/botsandsite` и project ID traffic-news.
2. `package.json` и `vercel.json` валидны.
3. Runtime chunks присутствуют полностью и в правильном порядке.
4. Локальный loader/entrypoint восстанавливает runtime без сетевой загрузки исходников.
5. Маршруты RUDI соответствуют рабочей production-сборке: health, Telegram, Alice shopping, product init, preview, daily.
6. `rst4231/botsandsite` после очистки не содержит RUDI routing/loader/filter logic.
7. Traffic-news конфигурация сохраняет собственный build и публикационный cron.

## Success criteria

После повторного подключения Git один push в `rst4231/rudi` может затронуть только `spb-daily-guide-bot`, а один push в `rst4231/botsandsite` может затронуть только `traffic-news-telegram-bot`. Между приложениями не остаётся runtime-зависимостей через GitHub или общий `vercel.json`.
