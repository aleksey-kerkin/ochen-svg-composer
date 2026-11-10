# Конструктор иллюстраций

Веб-сервис собирает иллюстрации только из готовых SVG-объектов
библиотеки. Этап 1: библиотека, холст и панели редактора.
Этап 2 (раскладка, поиск, перекраска, экспорт) ещё впереди.

## Запуск

Нужен pnpm.

```bash
pnpm install
pnpm dev
```

Проверки: `pnpm test`, `pnpm lint`, `pnpm build`.

`pnpm manifest` заново собирает `src/library/manifest.json`
из `assets/manifest.json` и `src/library/tags.json`.

## Исходники

Макет (копия кандидата):
[Тестовое | иллюстрации](https://www.figma.com/design/zTsotCGcnw9DjMBQwI4Jol).

Страницы:

- `26:11438` — Задание
- `0:1` — Библиотека компонентов
- `21:2` — Примеры композиций

SVG выгружены из этого файла и лежат в `src/assets`.
Исходные метаданные — `assets/manifest.json` и
`assets/palettes.json`.
