## Скрапер и обработчик продуктов из Ozon Fresh

В репозитории находится набор скриптов, который:
1. Собирает список товаров из любой **категории / подборки** Ozon Fresh;
2. Загружает подробную информацию о каждом товаре через внутренний JSON-API Ozon (TBD: с резервным переходом на Selenium-скрапинг HTML);
3. Обогащает данные (расчёт `pro/cal`, `pri/we`, извлечение веса, БЖУ и т. д.);
4. Сохраняет результат в аккуратные CSV-файлы, готовые к анализу в Excel / pandas.

Дополнительно поддерживается:
1. Работа с куками, чтобы видеть **цены и наличие для вашего адреса доставки**;
2. Режим обработки **одного продукта** (удобно для отладки);
3. Отдельный скрипт для оперативной **проверки наличия** товаров по списку URL-ов с учётом ваших куков;

---

## Установка и запуск
### Предварительные требования
• Python ≥ 3.9  
• Google Chrome + соответствующий chromedriver  
• Unix-подобная ОС (тестировано на Ubuntu 22.04). Windows - не тестировано, но должно работать, как минимум в WSL.

### Клонирование и установка
```bash
# Клонировать репозиторий
$ git clone <repo_url>
$ cd <repo_name>

# Создать виртуальное окружение и установить зависимости
$ python3 -m venv .venv && source .venv/bin/activate
$ pip install -r requirements.txt
```

### ChromeDriver
1. Скачать ChromeDriver для вашей версии Chrome и ОС
```bash
$ unzip chromedriver-linux64.zip # Например wget https://chromedriver.storage.googleapis.com/124.0.6121.23/chromedriver-linux64.zip
$ sudo mv chromedriver /usr/local/bin/
$ chmod +x /usr/local/bin/chromedriver # or sudo chmod +x /usr/local/bin/chromedriver
```

### Быстрый старт
1. **Сохранить сессию с адресом доставки (рекомендуется):**
   ```bash
   python availability_check.py --setup-cookies cookies.json
   ```
   Откроется окно Chrome — выберите желаемый адрес доставки, затем вернитесь в терминал и нажмите <Enter>. Куки будут сохранены в `cookies.json`.

2. **Скрапинг всей категории:**
   ```bash
   python ozon.py \
      --category-url "https://www.ozon.ru/category/supermarket-gotovye-blyuda-9521000" \
      --generate-urls
   ```
   Подробный дата-сет окажется в `data/supermarket-gotovye-blyuda/supermarket-gotovye-blyuda_detailed.csv`, а список URL-ов — в одноимённом `_product_urls.csv`.

3. **Скрапинг одного продукта:**
   ```bash
   python ozon.py --url https://www.ozon.ru/product/1650444606
   ```

4. **Проверка наличия товаров по CSV:**
   ```bash
   python availability_check.py data/supermarket-gotovye-blyuda/supermarket-gotovye-blyuda_product_urls.csv \
      --cookies cookies.json --output availability.csv
   ```
   CSV должен содержать хотя бы столбец `url`; наличие выводится в stdout и/или пишется в `availability.csv`.

---

## Подробнее о флагах

| Скрипт / флаг | Назначение |
|---------------|------------|
| **ozon.py** ||
| `--url <PRODUCT_URL>` | Обработать только один товар и вывести JSON в терминал |
| `--category-url <CATEGORY_URL>` | Базовый URL категории для скрапинга |
| `--generate-urls` | Игнорировать кэш и заново собрать список URL-ов |
| `--update-urls` | Добавить только **новые** товары к существующему списку |
| `--force-refetch` | Перекачать HTML / API данные, даже если они уже есть |
| `--force-reparse` | Перепарсить все сохранённые HTML заново |
| `--parallel-downloads N` | Кол-во потоков (по умолчанию — 1) |
| `--no-logging` | Скрыть сообщения в консоли (всё пишется в `ozon.log`) |
| **availability_check.py** ||
| `--setup-cookies <FILE>` | Захватить куки через реальный браузер и сохранить в `<FILE>` |
| `csv_path` (позиционный) | CSV с колонкой `url` для проверки наличия |
| `--cookies <FILE>` | Загрузить куки из файла |
| `--output <FILE>` | Записать результат проверки в CSV (по умолчанию `availability_output.csv`) |
| `--workers N` | Кол-во параллельных браузеров Selenium |
| `--no-headless-after` | Оставить браузер видимым после ввода адреса (медленнее) |

### Типичный workflow
1. Запустите с `--generate-urls`, когда обрабатываете категорию впервые.
2. В дальнейшем используйте `--update-urls`, чтобы добавлять только новые товары.
3. При серьёзных изменениях на сайте применяйте `--force-refetch` и/или `--force-reparse`.

---

## Структура проекта
```
.
├── ozon.py                              # Главный CLI: скрапинг, парсинг, экспорт CSV
├── availability_check.py                # Проверка наличия товаров (Selenium)
├── dl_html.py                           # Резервный HTML-даунлоадер через Selenium
├── runner.sh                            # Пример автоматизации на bash
├── data/                                # Генерируемый вывод (по подпапке на категорию)
│   └── supermarket-gotovye-blyuda/
│       ├── htmls/                       # сырой HTML каждого товара
│       ├── supermarket-gotovye-blyuda_product_urls.csv
│       └── supermarket-gotovye-blyuda_detailed.csv
└── README.md                            # Вы здесь
```