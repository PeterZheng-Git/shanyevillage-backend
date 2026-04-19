require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

const app = express()
const PORT = process.env.PORT || 3000

// ---- 启动时自动迁移数据库 ----
;(async () => {
  try {
    const { migrate } = require('./db/migrate')
    await migrate()
  } catch (err) {
    console.error('[Migrate] 自动迁移失败:', err.message)
  }
})()

// ---- CORS 配置 ----
// 允许 Vercel 管理后台、本地开发、以及任何 .vercel.app 子域名
const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:3000',
]

// 从环境变量追加生产域名
if (process.env.ADMIN_WEB_URL) {
  ALLOWED_ORIGINS.push(process.env.ADMIN_WEB_URL)
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin（如 Postman、iOS App 直接请求）
    if (!origin) return callback(null, true)
    // 允许 vercel.app 子域名
    if (origin.endsWith('.vercel.app')) return callback(null, true)
    // 允许 Railway 子域名
    if (origin.endsWith('.railway.app')) return callback(null, true)
    // 允许阿里云函数计算域名
    if (origin.endsWith('.fcappdelegation.net')) return callback(null, true)
    if (origin.endsWith('.fc.aliyuncs.com')) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    // 开发模式全部放行
    if (process.env.NODE_ENV !== 'production') return callback(null, true)
    callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// 全局限流（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { code: 429, message: '请求过于频繁，请稍后再试' }
  }))
}

// ---- 路由 ----
app.use('/v1/auth', require('./routes/auth'))
app.use('/v1/books', require('./routes/books'))
app.use('/v1/users', require('./routes/users'))
app.use('/v1/orders', require('./routes/orders'))
app.use('/v1/reading-progress', require('./routes/readingProgress'))
app.use('/v1/admin', require('./routes/admin'))

// 健康检查（Render 用）
app.get('/health', (req, res) => res.json({
  status: 'ok',
  time: new Date().toISOString(),
  env: process.env.NODE_ENV
}))

// 根路径
app.get('/', (req, res) => res.json({
  name: '山野村书 API',
  version: '1.0.0',
  status: 'running'
}))

// 404
app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }))

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err.message)
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] 山野村书 API 运行于 port ${PORT}，环境: ${process.env.NODE_ENV}`)
})

module.exports = app
