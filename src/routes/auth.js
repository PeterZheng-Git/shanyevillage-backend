const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const pool = require('../config/db')
const { generateToken, ok, fail } = require('../middleware/auth')
const axios = require('axios')
const rateLimit = require('express-rate-limit')

// 验证码发送限流
const codeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req) => req.body.phone || req.ip,
  message: { code: 429, message: '请等待 60 秒后再发送验证码' }
})

// ---- 生成随机 6 位验证码 ----
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ---- 发送短信验证码 ----
async function sendSMS(phone, code) {
  // Mock 模式：控制台打印，不实际发送（适合开发和初期上线）
  // 上线后在 Render 控制台将 SMS_MOCK_MODE 设置为 false 并填写真实配置
  if (process.env.SMS_MOCK_MODE === 'true' || process.env.NODE_ENV === 'development') {
    console.log(`[SMS MOCK] =============================`)
    console.log(`[SMS MOCK] 手机号: ${phone}`)
    console.log(`[SMS MOCK] 验证码: ${code}`)
    console.log(`[SMS MOCK] =============================`)
    return true
  }

  // 腾讯云短信（正式接入后取消注释）
  if (process.env.SMS_PROVIDER === 'tencent' && process.env.TENCENT_SMS_SECRET_ID) {
    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs')
      const SmsClient = tencentcloud.sms.v20210111.Client
      const client = new SmsClient({
        credential: {
          secretId: process.env.TENCENT_SMS_SECRET_ID,
          secretKey: process.env.TENCENT_SMS_SECRET_KEY,
        },
        region: 'ap-guangzhou',
      })
      await client.SendSms({
        SmsSdkAppId: process.env.TENCENT_SMS_APP_ID,
        SignName: process.env.TENCENT_SMS_SIGN_NAME || '山野村书',
        TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID,
        TemplateParamSet: [code, '5'],
        PhoneNumberSet: [`+86${phone}`],
      })
      return true
    } catch (err) {
      console.error('[SMS] 腾讯云发送失败:', err.message)
      return false
    }
  }

  console.warn('[SMS] 未配置短信服务，验证码仅输出到控制台')
  console.log(`[SMS] Phone: ${phone}, Code: ${code}`)
  return true
}

// POST /v1/auth/send-code
router.post('/send-code', codeLimiter, async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return fail(res, '手机号格式不正确')
    }

    const code = generateCode()
    const expiresAt = Math.floor(Date.now() / 1000) + 300 // 5分钟有效

    // 保存到数据库
    await pool.query(
      `INSERT INTO sms_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    )

    await sendSMS(phone, code)
    ok(res, null, '验证码已发送')
  } catch (err) {
    console.error('[Auth] send-code error:', err)
    fail(res, '发送失败，请稍后重试', 500)
  }
})

// POST /v1/auth/login-phone
router.post('/login-phone', async (req, res) => {
  try {
    const { phone, code } = req.body
    if (!phone || !code) return fail(res, '参数缺失')

    const now = Math.floor(Date.now() / 1000)

    // 验证码校验
    const { rows: codeRows } = await pool.query(
      `SELECT * FROM sms_codes 
       WHERE phone = $1 AND code = $2 AND expires_at > $3 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code, now]
    )

    if (!codeRows.length) return fail(res, '验证码错误或已过期')

    // 标记已使用
    await pool.query('UPDATE sms_codes SET used = TRUE WHERE id = $1', [codeRows[0].id])

    // 查找或创建用户
    let user
    const { rows: existUsers } = await pool.query(
      'SELECT * FROM users WHERE phone = $1', [phone]
    )

    if (existUsers.length) {
      user = existUsers[0]
    } else {
      const { rows: newUsers } = await pool.query(
        `INSERT INTO users (phone, nickname) VALUES ($1, $2) RETURNING *`,
        [phone, `书友${phone.slice(-4)}`]
      )
      user = newUsers[0]
    }

    const token = generateToken({ userId: user.id, role: 'user' })
    ok(res, {
      token,
      user: formatUser(user)
    })
  } catch (err) {
    console.error('[Auth] login-phone error:', err)
    fail(res, '登录失败', 500)
  }
})

// POST /v1/auth/login-wechat
router.post('/login-wechat', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return fail(res, '缺少微信授权码')

    // 换取 openid
    const wxRes = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET,
        code,
        grant_type: 'authorization_code'
      }
    })

    const { openid, access_token, errcode, errmsg } = wxRes.data
    if (errcode) return fail(res, `微信登录失败: ${errmsg}`)

    // 获取用户信息
    let nickname = '微信用户', avatarUrl = null
    try {
      const userInfoRes = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
        params: { access_token, openid, lang: 'zh_CN' }
      })
      nickname = userInfoRes.data.nickname || nickname
      avatarUrl = userInfoRes.data.headimgurl
    } catch (_) {}

    // 查找或创建用户
    let user
    const { rows: existUsers } = await pool.query(
      'SELECT * FROM users WHERE wechat_open_id = $1', [openid]
    )

    if (existUsers.length) {
      user = existUsers[0]
      // 更新头像昵称
      await pool.query(
        'UPDATE users SET nickname = $1, avatar_url = $2 WHERE id = $3',
        [nickname, avatarUrl, user.id]
      )
      user.nickname = nickname
      user.avatar_url = avatarUrl
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (wechat_open_id, nickname, avatar_url) VALUES ($1, $2, $3) RETURNING *`,
        [openid, nickname, avatarUrl]
      )
      user = rows[0]
    }

    const token = generateToken({ userId: user.id, role: 'user' })
    ok(res, { token, user: formatUser(user) })
  } catch (err) {
    console.error('[Auth] wechat error:', err)
    fail(res, '微信登录失败', 500)
  }
})

function formatUser(u) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarURL: u.avatar_url,
    phone: u.phone,
    wechatOpenID: u.wechat_open_id,
    purchasedBookIDs: [],
    createdAt: u.created_at
  }
}

module.exports = router
