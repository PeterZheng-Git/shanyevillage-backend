const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { authMiddleware, ok, fail } = require('../middleware/auth')

// GET /v1/users/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    
    // 获取已购买书籍 ID 列表
    const { rows: orderRows } = await pool.query(
      `SELECT book_id FROM orders WHERE user_id = $1 AND status = 'success'`,
      [userId]
    )
    
    ok(res, {
      id: req.user.id,
      nickname: req.user.nickname,
      avatarURL: req.user.avatar_url,
      phone: req.user.phone,
      purchasedBookIDs: orderRows.map(r => r.book_id),
      createdAt: req.user.created_at
    })
  } catch (err) {
    fail(res, '获取用户信息失败', 500)
  }
})

// GET /v1/users/bookshelf - 书架（已购书籍 + 阅读进度）
router.get('/bookshelf', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    
    // 获取已购书籍
    const { rows: books } = await pool.query(
      `SELECT b.* FROM books b
       INNER JOIN orders o ON o.book_id = b.id
       WHERE o.user_id = $1 AND o.status = 'success'`,
      [userId]
    )
    
    // 获取阅读进度
    const { rows: progress } = await pool.query(
      `SELECT * FROM reading_progress WHERE user_id = $1`,
      [userId]
    )
    
    ok(res, {
      books: books.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        coverURL: b.cover_url || '',
        description: b.description || '',
        wordCount: b.word_count,
        price: parseFloat(b.price),
        category: b.category,
        tags: b.tags || [],
        freeChapterCount: b.free_chapter_count,
        isRecommended: b.is_recommended,
        sortOrder: b.sort_order,
        publishedAt: b.published_at,
        updatedAt: b.updated_at,
        chapters: []
      })),
      progress: progress.map(p => ({
        id: p.id,
        userId: p.user_id,
        bookId: p.book_id,
        chapterId: p.chapter_id,
        chapterOrder: p.chapter_order,
        scrollOffset: p.scroll_offset,
        lastReadAt: p.last_read_at
      }))
    })
  } catch (err) {
    fail(res, '获取书架失败', 500)
  }
})

module.exports = router
