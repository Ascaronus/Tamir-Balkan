# Spec Delta: rozetka-import

## MODIFIED Requirements

### Requirement: Import source URL configuration
Система обязана (MUST) хранить настроенный URL фида Rozetka в метаданных магазина (`metadata.rozetka_source_url`) и отдавать его через GET `/admin/rozetka/settings` в поле `source_url`, подставляя при отсутствии настройки значение по умолчанию `https://tamir.ua/rozetka/` — адрес рабочего фида магазина; POST сохраняет новое значение. Значение по умолчанию обязано (MUST) быть одним и тем же для всех путей импорта: поле источника страницы `/rozetka`, GET `/admin/rozetka/settings`, предпросмотр источника, скрипт ретро-правки SKU и fallback CLI-импорта (`ROZETKA_XML_URL`) используют одну константу `DEFAULT_XML_URL`.

#### Scenario: Empty configuration
- **WHEN** в метаданных магазина нет `rozetka_source_url`
- **THEN** GET `/admin/rozetka/settings` возвращает `source_url` со значением по умолчанию `https://tamir.ua/rozetka/`
- **AND** иных полей (в том числе признака значения по умолчанию) в ответе нет

#### Scenario: Defaults agree across the import paths
- **WHEN** адрес источника нигде не настроен и откроется страница `/rozetka`
- **THEN** адрес в поле источника, значение по умолчанию в GET `/admin/rozetka/settings`, адрес предпросмотра по умолчанию и fallback `ROZETKA_XML_URL` CLI-импорта равны одному и тому же значению `https://tamir.ua/rozetka/`

#### Scenario: Saved address wins over the default
- **WHEN** в `metadata.rozetka_source_url` сохранён иной разрешённый адрес фида
- **THEN** GET `/admin/rozetka/settings` и страница `/rozetka` используют сохранённый адрес, а значение по умолчанию не подставляется
