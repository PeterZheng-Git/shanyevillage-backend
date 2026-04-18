const jwt = require('jsonwebtoken')
const pool = require('../config/db')

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_prod'

// ---- 生成 JWT ----
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  })
}

// ---- 用户鉴权中间件 ----
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' })
    }
    const token = authHeader.slice(7)
    const payload = jwt.verify(token, JWT_SECRET)
    
    // 查询用户是否存在
    const { rows } = await pool.query('SELECT id, nickname, phone, avatar_url FROM users WHERE id = $1', [payload.userId])
    if (!rows.length) return res.status(401).json({ code: 401, message: '用户不存在' })
    
    req.user = rows[0]
    next()
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' })
  }
}

// ---- 管理员鉴权中间件 ----
function adminAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' })
    }
    const token = authHeader.slice(7)
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权限' })
    }
    req.admin = payload
    next()
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效' })
  }
}

// ---- 响应工具 ----
function ok(res, data, message = 'success') {
  return res.json({ code: 0, message, data })
}

function fail(res, message = '操作失败', code = 400) {
  return res.status(code).json({ code, message, data: null })
}

module.exports = { generateToken, authMiddleware, adminAuthMiddleware, ok, fail }
