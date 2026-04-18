const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const cloudinary = require('cloudinary').v2
const { adminAuthMiddleware, generateToken, ok, fail } = require('../middleware/auth')

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// multer 内存存储（上传到 Cloudinary）
const storage = multer.memoryStorage()
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

// ======================== 认证 ========================

// POST /v1/admin/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (username !== process.env.ADMIN_USERNAME) return fail(res, '用户名或密码错误')
    const isValid = password === process.env.ADMIN_PASSWORD
    if (!isValid) return fail(res, '用户名或密码错误')
    const token = generateToken({ role: 'admin', username })
    ok(res, { token })
  } catch (err) {
    fail(res, '登录失败', 500)
  }
})

// ======================== 文件上传 ========================

// POST /v1/admin/upload/cover
router.post('/upload/cover', adminAuthMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return fail(res, '未收到文件')
    
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'shanye-book/covers', resource_type: 'image', transformation: [{ width: 300, height: 450, crop: 'fill' }] },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer)
    })
    
    ok(res, { url: result.secure_url })
  } catch (err) {
    console.error('[Admin] upload error:', err)
    fail(res, '上传失败：' + err.message, 500)
  }
})

// ======================== 书籍 CRUD ========================

// GET /v1/admin/books
router.get('/books', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', category = '' } = req.query
    const offset = (page - 1) * pageSize
    const params = []
    let where = 'WHERE 1=1'
    let idx = 1
    
    if (keyword) {
      where += ` AND (title ILIKE $${idx} OR author ILIKE $${idx})`
      params.push(`%${keyword}%`)
      idx++
    }
    if (category) {
      where += ` AND category = $${idx++}`
      params.push(category)
    }
    
    const { rows } = await pool.query(
      `SELECT * FROM books ${where} ORDER BY sort_order ASC, published_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    )
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM books ${where}`,
      params
    )
    
    ok(res, { list: rows.map(formatBook), total: parseInt(countRows[0].count) })
  } catch (err) {
    fail(res, '获取书籍失败', 500)
  }
})

// GET /v1/admin/books/:id
router.get('/books/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM books WHERE id = $1', [req.params.id])
    if (!rows.length) return fail(res, '书籍不存在', 404)
    ok(res, formatBook(rows[0]))
  } catch (err) {
    fail(res, '获取书籍失败', 500)
  }
})

// POST /v1/admin/books
router.post('/books', adminAuthMiddleware, async (req, res) => {
  try {
    const { title, author, coverURL, description, wordCount, price, category, freeChapterCount, isRecommended, sortOrder } = req.body
    if (!title || !author) return fail(res, '书名和作者不能为空')
    
    const { rows } = await pool.query(
      `INSERT INTO books (title, author, cover_url, description, word_count, price, category, free_chapter_count, is_recommended, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, author, coverURL || '', description || '', wordCount || 0, price || 1, category || '其他', freeChapterCount || 2, isRecommended || false, sortOrder || 0]
    )
    ok(res, formatBook(rows[0]))
  } catch (err) {
    fail(res, '创建书籍失败：' + err.message, 500)
  }
})

// PUT /v1/admin/books/:id
router.put('/books/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { title, author, coverURL, description, wordCount, price, category, freeChapterCount, isRecommended, sortOrder } = req.body
    const now = Math.floor(Date.now() / 1000)
    const { rows } = await pool.query(
      `UPDATE books SET title=$1, author=$2, cover_url=$3, description=$4, word_count=$5, 
       price=$6, category=$7, free_chapter_count=$8, is_recommended=$9, sort_order=$10, updated_at=$11
       WHERE id = $12 RETURNING *`,
      [title, author, coverURL || '', description || '', wordCount || 0, price || 1, category || '其他', freeChapterCount || 2, isRecommended || false, sortOrder || 0, now, req.params.id]
    )
    if (!rows.length) return fail(res, '书籍不存在', 404)
    ok(res, formatBook(rows[0]))
  } catch (err) {
    fail(res, '更新书籍失败', 500)
  }
})

// DELETE /v1/admin/books/:id
router.delete('/books/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM books WHERE id = $1', [req.params.id])
    if (!rowCount) return fail(res, '书籍不存在', 404)
    ok(res, null, '已删除')
  } catch (err) {
    fail(res, '删除失败', 500)
  }
})

// ======================== 章节 CRUD ========================

// GET /v1/admin/books/:bookId/chapters
router.get('/books/:bookId/chapters', adminAuthMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM chapters WHERE book_id = $1 ORDER BY chapter_order ASC',
      [req.params.bookId]
    )
    ok(res, rows.map(formatChapter))
  } catch (err) {
    fail(res, '获取章节失败', 500)
  }
})

// POST /v1/admin/books/:bookId/chapters
router.post('/books/:bookId/chapters', adminAuthMiddleware, async (req, res) => {
  try {
    const { title, content, isFree, order } = req.body
    if (!title) return fail(res, '章节标题不能为空')
    
    const wordCount = (content || '').replace(/\s/g, '').length
    const { rows } = await pool.query(
      `INSERT INTO chapters (book_id, title, content, chapter_order, word_count, is_free)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.bookId, title, content || '', order ?? 0, wordCount, isFree || false]
    )
    
    // 更新书籍总字数
    await pool.query(
      `UPDATE books SET word_count = (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = $1) WHERE id = $1`,
      [req.params.bookId]
    )

    // 更新 is_free（根据 freeChapterCount）
    await updateFreeChapters(req.params.bookId)
    
    ok(res, formatChapter(rows[0]))
  } catch (err) {
    fail(res, '添加章节失败：' + err.message, 500)
  }
})

// PUT /v1/admin/books/:bookId/chapters/:chapterId
router.put('/books/:bookId/chapters/:chapterId', adminAuthMiddleware, async (req, res) => {
  try {
    const { title, content, isFree } = req.body
    const wordCount = (content || '').replace(/\s/g, '').length
    const now = Math.floor(Date.now() / 1000)
    
    const { rows } = await pool.query(
      `UPDATE chapters SET title=$1, content=$2, word_count=$3, is_free=$4, updated_at=$5
       WHERE id = $6 AND book_id = $7 RETURNING *`,
      [title, content || '', wordCount, isFree || false, now, req.params.chapterId, req.params.bookId]
    )
    if (!rows.length) return fail(res, '章节不存在', 404)
    
    // 更新书籍总字数
    await pool.query(
      `UPDATE books SET word_count = (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = $1) WHERE id = $1`,
      [req.params.bookId]
    )
    
    ok(res, formatChapter(rows[0]))
  } catch (err) {
    fail(res, '更新章节失败', 500)
  }
})

// DELETE /v1/admin/books/:bookId/chapters/:chapterId
router.delete('/books/:bookId/chapters/:chapterId', adminAuthMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM chapters WHERE id = $1 AND book_id = $2',
      [req.params.chapterId, req.params.bookId]
    )
    if (!rowCount) return fail(res, '章节不存在', 404)
    
    // 更新字数
    await pool.query(
      `UPDATE books SET word_count = (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = $1) WHERE id = $1`,
      [req.params.bookId]
    )
    
    ok(res, null, '已删除')
  } catch (err) {
    fail(res, '删除章节失败', 500)
  }
})

// ======================== 用户管理 ========================

router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '' } = req.query
    const offset = (page - 1) * pageSize
    const params = keyword ? [`%${keyword}%`] : []
    const where = keyword ? 'WHERE nickname ILIKE $1 OR phone ILIKE $1' : ''
    
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(o.book_id) FILTER (WHERE o.status = 'success') as purchased_book_ids
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    )
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM users ${where}`, params
    )
    
    ok(res, {
      list: rows.map(u => ({
        id: u.id,
        nickname: u.nickname,
        avatarURL: u.avatar_url,
        phone: u.phone,
        wechatOpenID: u.wechat_open_id,
        purchasedBookIDs: u.purchased_book_ids?.filter(Boolean) || [],
        createdAt: u.created_at
      })),
      total: parseInt(countRows[0].count)
    })
  } catch (err) {
    fail(res, '获取用户列表失败', 500)
  }
})

// ======================== 订单管理 ========================

router.get('/orders', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query
    const offset = (page - 1) * pageSize
    const params = []
    let where = 'WHERE 1=1'
    let idx = 1
    
    if (keyword) {
      where += ` AND (book_title ILIKE $${idx} OR transaction_id ILIKE $${idx})`
      params.push(`%${keyword}%`)
      idx++
    }
    if (status) {
      where += ` AND status = $${idx++}`
      params.push(status)
    }
    
    const { rows } = await pool.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    )
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM orders ${where}`, params
    )
    
    ok(res, {
      list: rows.map(o => ({
        id: o.id,
        userId: o.user_id,
        bookId: o.book_id,
        bookTitle: o.book_title,
        amount: parseFloat(o.amount),
        transactionId: o.transaction_id,
        status: o.status,
        createdAt: o.created_at
      })),
      total: parseInt(countRows[0].count)
    })
  } catch (err) {
    fail(res, '获取订单失败', 500)
  }
})

// ======================== 工具函数 ========================

async function updateFreeChapters(bookId) {
  const { rows: bookRows } = await pool.query('SELECT free_chapter_count FROM books WHERE id = $1', [bookId])
  if (!bookRows.length) return
  const freeCount = bookRows[0].free_chapter_count
  
  // 先全部设为付费
  await pool.query('UPDATE chapters SET is_free = FALSE WHERE book_id = $1', [bookId])
  // 前 N 章设为免费
  if (freeCount > 0) {
    await pool.query(
      `UPDATE chapters SET is_free = TRUE WHERE book_id = $1 AND chapter_order < $2`,
      [bookId, freeCount]
    )
  }
}

function formatBook(b) {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    coverURL: b.cover_url || '',
    description: b.description || '',
    wordCount: b.word_count || 0,
    price: parseFloat(b.price),
    category: b.category,
    tags: b.tags || [],
    freeChapterCount: b.free_chapter_count,
    isRecommended: b.is_recommended,
    sortOrder: b.sort_order,
    publishedAt: b.published_at,
    updatedAt: b.updated_at
  }
}

function formatChapter(c) {
  return {
    id: c.id,
    bookId: c.book_id,
    title: c.title,
    content: c.content,
    order: c.chapter_order,
    wordCount: c.word_count || 0,
    isFree: c.is_free
  }
}

module.exports = router
