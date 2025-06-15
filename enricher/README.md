## Обогащение данных продуктов через Google Gemini AI

Скрипт анализирует продукты из CSV-файлов и добавляет диетологическую информацию с помощью Google Gemini Flash:
1. Рейтинги совместимости с диетами (кето, палео, карнивор, AIP);
2. Оценка FODMAP, глютена и лактозы;
3. Анализ пригодности для завтрака/обеда/ужина/перекуса;
4. Индексы сытости, плотности питательных веществ, клетчатки;
5. Теги пользы для здоровья и рекомендации по сочетанию.

Результат: исходный CSV + ~30 новых колонок с плоской структурой данных.

---

## Установка и запуск

### Предварительные требования
• Python ≥ 3.9  
• API-ключ Google Gemini (бесплатный лимит: 15 запросов/мин)

### Установка зависимостей
```bash
pip install pandas google-generativeai pydantic nest-asyncio
```

### Быстрый старт
1. **Поместите CSV-файл в папку enricher:**
   ```bash
   cp "Готовая еда.csv" enricher/
   ```

2. **Запустите обогащение:**
   ```bash
   cd enricher
   python enrich_app_standalone.py
   ```

3. **Результат:** `Готовая еда_enriched_v4.csv` с исходными данными + новыми колонками анализа.

---

## Конфигурация

Отредактируйте константы в начале `enrich_app_standalone.py`:

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `API_KEY` | Ключ Google Gemini API | Жёстко прописан |
| `INPUT_CSV_FILE` | Входной CSV-файл | `"Готовая еда.csv"` |
| `OUTPUT_CSV_FILE` | Выходной CSV-файл | `"Готовая еда_enriched_v4.csv"` |
| `MAX_CONCURRENT_REQUESTS` | Параллельные запросы | 3 |
| `MAX_RETRIES` | Повторы при ошибке | 3 |

### Получение API-ключа
1. Перейдите на [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Создайте новый API-ключ
3. Замените значение `API_KEY` в скрипте

---

## Добавляемые колонки

### Рейтинги приёма пищи (1-5)
- `meal_suitability_breakfast_rating`
- `meal_suitability_lunch_rating` 
- `meal_suitability_dinner_rating`
- `meal_suitability_snack_rating`

### Диетические рейтинги (1-5)
- `fodmap_rating` — 1=высокий FODMAP, 5=низкий
- `gluten_presence_rating` — 1=содержит глютен, 5=безглютеновый  
- `lactose_level_rating` — 1=содержит лактозу, 5=без лактозы
- `keto_friendly_rating` — совместимость с кето-диетой
- `paleo_friendly_rating` — совместимость с палео-диетой
- `carnivore_friendly_rating` — совместимость с карнивор-диетой
- `autoimmune_friendly_rating` — совместимость с AIP-диетой

### Анализ состава
- `satiety_index_estimate` — индекс сытости (Low/Medium/High)
- `nutrient_density_estimate` — плотность питательных веществ
- `fiber_level_estimate` — уровень клетчатки
- `sodium_level_estimate` — уровень натрия
- `health_benefit_tags` — теги пользы (разделены `;`)

### Обоснования
- `fodmap_rating_reasoning`
- `keto_friendly_reasoning`
- И т.д. для каждого диетического рейтинга

---

## Структура проекта
```
enricher/
├── enrich_app_standalone.py    # Основной скрипт
├── README.md                   # Вы здесь
├── Готовая еда.csv            # Входные данные (пример)
└── Готовая еда_enriched_v4.csv # Результат обогащения
``` 