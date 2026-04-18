const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { authMiddleware, ok, fail } = require('../middleware/auth')

// GET /v1/books - 书籍列表（公开）
router.get('/', async (req, res) => {
  try {
    const { category, keyword, page = 1, pageSize = 50 } = req.query
    const offset = (page - 1) * pageSize

    let whereClause = 'WHERE 1=1'
    const params = []
    let paramIdx = 1

    if (category && category !== '全部') {
      whereClause += ` AND b.category = $${paramIdx++}`
      params.push(category)
    }
    if (keyword) {
      whereClause += ` AND (b.title ILIKE $${paramIdx} OR b.author ILIKE $${paramIdx})`
      params.push(`%${keyword}%`)
      paramIdx++
    }

    const { rows } = await pool.query(
      `SELECT b.*, 
         COALESCE(array_agg(DISTINCT c.id ORDER BY c.chapter_order) FILTER (WHERE c.id IS NOT NULL), '{}') as chapter_ids
       FROM books b
       LEFT JOIN chapters c ON c.book_id = b.id
       ${whereClause}
       GROUP BY b.id
       ORDER BY b.is_recommended DESC, b.sort_order ASC, b.published_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    )

    const books = rows.map(formatBook)
    ok(res, books)
  } catch (err) {
    console.error('[Books] list error:', err)
    fail(res, '获取书籍列表失败', 500)
  }
})

// GET /v1/books/:id - 书籍详情（公开）
router.get('/:id', async (req, res) => {
  try {
    const { rows: bookRows } = await pool.query(
      `SELECT * FROM books WHERE id = $1`, [req.params.id]
    )
    if (!bookRows.length) return fail(res, '书籍不存在', 404)

    const book = bookRows[0]

    // 获取章节列表（仅元数据，不含正文）
    const { rows: chapterRows } = await pool.query(
      `SELECT id, book_id, title, chapter_order, word_count, is_free 
       FROM chapters WHERE book_id = $1 ORDER BY chapter_order ASC`,
      [req.params.id]
    )

    const result = {
      ...formatBook(book),
      chapters: chapterRows.map(formatChapterMeta)
    }
    ok(res, result)
  } catch (err) {
    console.error('[Books] detail error:', err)
    fail(res, '获取书籍详情失败', 500)
  }
})

// GET /v1/books/:id/chapters - 章节列表（元数据）
router.get('/:id/chapters', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, book_id, title, chapter_order, word_count, is_free 
       FROM chapters WHERE book_id = $1 ORDER BY chapter_order ASC`,
      [req.params.id]
    )
    ok(res, rows.map(formatChapterMeta))
  } catch (err) {
    fail(res, '获取章节失败', 500)
  }
})

// GET /v1/books/:id/chapters/:chapterId - 章节正文
// 免费章节公开，付费章节需鉴权 + 购买验证
router.get('/:id/chapters/:chapterId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM chapters WHERE id = $1 AND book_id = $2`,
      [req.params.chapterId, req.params.id]
    )
    if (!rows.length) return fail(res, '章节不存在', 404)

    const chapter = rows[0]

    if (!chapter.is_free) {
      // 需要登录 + 购买验证
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return fail(res, '请先购买此书', 403)
      }
      
      const jwt = require('jsonwebtoken')
      let userId
      try {
        const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
        userId = payload.userId
      } catch {
        return fail(res, 'Token 无效', 401)
      }

      const { rows: orderRows } = await pool.query(
        `SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND status = 'success'`,
        [userId, req.params.id]
      )
      if (!orderRows.length) return fail(res, '请先购买此书后再阅读', 403)
    }

    ok(res, formatChapterFull(chapter))
  } catch (err) {
    console.error('[Books] chapter error:', err)
    fail(res, '获取章节内容失败', 500)
  }
})

// ---- 工具函数 ----
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
    updatedAt: b.updated_at,
    chapters: []
  }
}

function formatChapterMeta(c) {
  return {
    id: c.id,
    bookId: c.book_id,
    title: c.title,
    content: '',
    order: c.chapter_order,
    wordCount: c.word_count || 0,
    isFree: c.is_free
  }
}

function formatChapterFull(c) {
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
