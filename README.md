## Веб-интерфейс для данных из продуктовых скрапераов

### Что это?
В репозитории находится удобная **SPA-админка** (React + Express), которая превращает «сырые» CSV-файлы, сгенерированные скраперами `ozon-scraper` и `vkusvill-scraper`, в интерактивную таблицу:

1. Просмотр тысяч позиций без подвисаний;
2. Мгновенный поиск и продвинутая фильтрация;
3. Управление столбцами (drag-&-drop порядок, скрытие лишнего, resize);
4. Редактирование строк на лету с сохранением обратно в CSV;
5. Экспорт любой строки одним кликом в **Google Sheets**;
6. Проверка актуального наличия и цены через скрипты-проверщики;
7. Тёмная/светлая тема и многое другое.

---

## Основные возможности

| Блок | Что умеет |
|------|-----------|
| **CSV Viewer** | • Постраничный вывод *любого* CSV<br/>• Сортировка по столбцу ↑↓<br/>• Показ изображений по `imgUrl`<br/>• Глобальный поиск по всем полям |
| **Фильтры** | • «Contains / Exclude» для строковых полей<br/>• `=` и диапазоны для чисел<br/>• Отдельный тумблер «Скрыть блюда с неизвестными БЖУ» |
| **Column Manager** | • Drag-n-drop порядок столбцов<br/>• Массовое скрытие/показ<br/>• Persist через LocalStorage |
| **Row Actions** | • ✏️ Редактировать → модальное окно<br/>• 🗑 Удалить с подтверждением<br/>• 🔄 Обновить наличие (вызывает Python-чекер)<br/>• 📋 Отправить в Google Sheets |
| **Google Sheets** | • Авторизация сервис-аккаунтом (без OAuth всплывашек)<br/>• Поддержка нескольких документов, автокомплит истории URL-ов<br/>• Выбор целевого листа (таб-а) |
| **Backend API** | • REST для чтения/записи CSV<br/>• Обёртка над `googleapis`<br/>• Запуск внешних Python-скриптов с троттлингом |
| **Скрипты** | `scripts/data_migration.py` → массовый импорт последнего вывода скрапера в папку `csv/` |

---

## Установка и запуск

### 1. Клонируем репозиторий и ставим Node-зависимости
```bash
# Frontend + backend (monorepo)
git clone <repo_url>
cd <repo_name>
npm install
```

### 2. Готовим Python-окружение для скрапера
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Ставим браузеры Playwright
playwright install
```

### 3. Настраиваем Google Sheets (опционально: если хотим сохранять продукты себе в Google Sheets)
1. Создайте сервис-аккаунт и json-ключ как описано в [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md).
2. Экспортируйте переменную окружения:
```bash
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/abs/path/credentials.json
```

## Как пользоваться

### 1. Сначала получаем свежие CSV
Выполните скрапинг (пример для Вкусвилла):
```bash
cd vkusvill-scraper
python vkusvill.py \
    --category-url "https://vkusvill.ru/goods/gotovaya-eda/" \
    --generate-urls
python vkusvill.py \
    --category-url "https://vkusvill.ru/goods/syry/" \
    --generate-urls
```
CSV-файлы появятся в `vkusvill-scraper/data/<category>/..._detailed.csv`.

Подробнее о скрапинге Вкусвилла [здесь](./vkusvill-scraper/README.md).

Озон:
```bash
cd ../ozon-scraper
python ozon.py \
    --category-url "https://www.ozon.ru/category/supermarket-gotovye-blyuda-9521000" \
    --generate-urls
python ozon.py \
    --category-url "https://www.ozon.ru/category/kofe-i-kakao-94672000" \
    --generate-urls
```
CSV-файлы появятся в `ozon-scraper/data/<category>/..._detailed.csv`.

Подробнее о скрапинге Озон [здесь](./ozon-scraper/README.md).

### 2. Мигрируем данные в веб-интерфейс
```bash
cd ../scripts
python data_migration.py --replace # Или --update, если нужно обновить данные
```
Скрипт создаст/обновит папку `csv/` в нужном формате (`<Магазин>/<Категория>.csv`). Сделает бэкап старой версии в ./scripts/backup/

Подробнее о миграции [здесь](./scripts/data_migration.py).

### 3. Запускаем веб-интерфейс
```bash
cd ../
npm run dev
```

### 4. Открываем браузер
1. Выбираем магазин («Озон» или «Вкусвилл»).
2. Во второй колонке кликаем на категорию или Global Search (если данных много, может быть лаг)
3. Пользуемся поиском, фильтрами, менеджером столбцов.
4. Под выпадашкой «Google Sheets Integration» можно сохранить URL таблицы и имя листа или создать новую таблицу. Подробнее о работе с Google Sheets [здесь](./GOOGLE_SHEETS_SETUP.md).
5. ⋮ в начале строки откроет меню действий (редактирование, экспорт, удаление, обновление наличия).

### Типичный рабочий цикл
1. `--generate-urls` → первичное наполнение базы.
2. `--update-urls` (в скраперах) + `data_migration.py --update` → ежедневный инкремент.
3. В UI снимаем/ставим фильтры, копируем нужные товары в Google Sheets. Подробнее о работе с Google Sheets [здесь](./GOOGLE_SHEETS_SETUP.md).
4. Если хотим уточнить наличие, нажимаем бургер-меню Actions → «🔄 Refresh availability» для конкретной строки.

---

## Структура репозитория
```
.
├── src/                  # Frontend (React + Vite + Tailwind)
│   ├── components/       # CSVViewer, FilterPanel, ColumnManager, ...
│   ├── context/          # ThemeContext, GoogleSheetsContext, CSVContext
│   ├── hooks/            # Пользовательские хуки (useToast и др.)
│   └── config/           # columnConfig.ts, global.ts
├── api/                  # Express-сервер (REST + Google Sheets proxy)
│   └── server.js         # > 1000 строк любви и CSV-магии
├── scripts/              # Вспомогательные Python-утилиты
│   └── data_migration.py # Массовый импорт/обновление CSV
├── csv/                  # «База данных» в виде простых CSV (создаётся скриптом)
│   ├── Озон/
│   └── Вкусвилл/
├── ozon-scraper/         # 🥑 Скрапер Озон
├── vkusvill-scraper/     # 🥦 Скрапер Вкусвилл
├── package.json          # npm-зависимости и скрипты (vite + concurrently)
└── README.md             # вы здесь
```

## NB
- Google Sheets API не работает с российским IP, а скрапинг озона - с зарубежного. Поэтому для одновременной поддержки функциональностей и гугл-таблиц, и обновления наличия товаров, нужно использовать Split Tunelling (я это делаю с использованием NekoRay, прописав в direct айпи-адреса ozon.ru и api.ozon.ru, полученные nslookup; весь остальной трафик идет через VPN).
- Куки Вкусвилла живут долго, в отличие от Озона.