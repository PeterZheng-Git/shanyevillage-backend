const { Pool } = require('pg')

// 支持 DATABASE_URL (Supabase/Render) 或分项配置
let poolConfig

if (process.env.DATABASE_URL) {
  // 确保连接串含 sslmode=require 参数
  let dbUrl = process.env.DATABASE_URL.trim()
  const url = new URL(dbUrl)
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require')
  }

  poolConfig = {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: false,
      // 对于 pooler session 模式，强制 TLS
      servername: url.hostname,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  }
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'shanye_book',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }
}

const pool = new Pool(poolConfig)

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err.message)
})

pool.query('SELECT NOW()').then(() => {
  console.log('[DB] ✅ 数据库连接成功')
}).catch(err => {
  console.error('[DB] ❌ 数据库连接失败:', err.message)
})

module.exports = pool
