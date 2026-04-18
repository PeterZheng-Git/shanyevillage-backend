const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { authMiddleware, ok, fail } = require('../middleware/auth')

// POST /v1/reading-progress - 保存阅读进度
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { book_id, chapter_id, chapter_order, scroll_offset = 0 } = req.body
    const userId = req.user.id

    if (!book_id || chapter_order === undefined) return fail(res, '参数缺失')

    const now = Math.floor(Date.now() / 1000)
    await pool.query(
      `INSERT INTO reading_progress (user_id, book_id, chapter_id, chapter_order, scroll_offset, last_read_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, book_id) DO UPDATE SET
         chapter_id = EXCLUDED.chapter_id,
         chapter_order = EXCLUDED.chapter_order,
         scroll_offset = EXCLUDED.scroll_offset,
         last_read_at = EXCLUDED.last_read_at`,
      [userId, book_id, chapter_id, chapter_order, scroll_offset, now]
    )

    ok(res, null, '进度已保存')
  } catch (err) {
    console.error('[Progress] save error:', err)
    fail(res, '保存进度失败', 500)
  }
})

module.exports = router
