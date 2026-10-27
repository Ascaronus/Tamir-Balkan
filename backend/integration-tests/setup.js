const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")
const { assertEnvironmentSafe } = require("../test-support/guard-env.cjs")

// Контракт: openspec testing/isolated-test-environment.
// medusaIntegrationTestRunner создаёт собственную временную базу из
// DB_HOST/DB_USERNAME/DB_PASSWORD/DB_PORT, поэтому здесь проверяется только
// то, что в окружении нет строки подключения к не-тестовой базе: при находке
// Jest падает до первого запроса к PostgreSQL.
assertEnvironmentSafe()

MetadataStorage.clear()
