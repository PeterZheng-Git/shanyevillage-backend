const pool = require('../config/db')

/**
 * 数据库迁移脚本
 * 运行: node src/db/migrate.js
 */
async function migrate() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ---- 用户表 ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nickname    VARCHAR(64) NOT NULL DEFAULT '新用户',
        avatar_url  TEXT,
        phone       VARCHAR(20) UNIQUE,
        wechat_open_id TEXT UNIQUE,
        created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // ---- 书籍表 ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS books (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title              VARCHAR(128) NOT NULL,
        author             VARCHAR(64) NOT NULL,
        cover_url          TEXT,
        description        TEXT,
        word_count         INT DEFAULT 0,
        price              DECIMAL(10,2) DEFAULT 1.00,
        category           VARCHAR(32) DEFAULT '其他',
        tags               TEXT[] DEFAULT '{}',
        free_chapter_count INT DEFAULT 2,
        is_recommended     BOOLEAN DEFAULT FALSE,
        sort_order         INT DEFAULT 0,
        published_at       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at         BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // ---- 章节表 ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        title       VARCHAR(256) NOT NULL,
        content     TEXT NOT NULL DEFAULT '',
        chapter_order INT NOT NULL DEFAULT 0,
        word_count  INT DEFAULT 0,
        is_free     BOOLEAN DEFAULT FALSE,
        created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(book_id, chapter_order)
      )
    `)

    // ---- 购买记录表 ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id              UUID NOT NULL REFERENCES users(id),
        book_id              UUID NOT NULL REFERENCES books(id),
        book_title           VARCHAR(128),
        amount               DECIMAL(10,2) DEFAULT 1.00,
        transaction_id       VARCHAR(256),
        original_transaction_id VARCHAR(256),
        receipt_data         TEXT,
        status               VARCHAR(20) DEFAULT 'pending',
        created_at           BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(user_id, book_id)
      )
    `)

    // ---- 阅读进度表 ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_progress (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID NOT NULL REFERENCES users(id),
        book_id        UUID NOT NULL REFERENCES books(id),
        chapter_id     UUID,
        chapter_order  INT DEFAULT 0,
        scroll_offset  FLOAT DEFAULT 0,
        last_read_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(user_id, book_id)
      )
    `)

    // ---- 验证码表（临时存储）----
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_codes (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone      VARCHAR(20) NOT NULL,
        code       VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        used       BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // ---- 索引 ----
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id, chapter_order)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(user_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_books_category ON books(category)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_books_recommended ON books(is_recommended, sort_order)`)

    await client.query('COMMIT')
    console.log('[Migrate] ✅ 数据库迁移成功')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[Migrate] ❌ 失败:', err.message)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
}

module.exports = { migrate }

migrate()
