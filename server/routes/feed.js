const router = require('express').Router();
const db     = require('../db');
const { optionalAuth } = require('../auth');

// GET /api/feed?page=1&limit=20
// Returns all public notes only, newest first, with author info + counts
router.get('/', optionalAuth, (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const rows = db.prepare(`
    SELECT n.id, n.title, n.body, n.font, n.font_size, n.bg_url, n.tags,
           n.created_at, n.views, n.color_idx, n.is_public,
           u.id as author_id, u.username, u.display_name, u.avatar_url
    FROM notes n
    JOIN users u ON u.id = n.user_id
    WHERE n.is_public = 1
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM notes WHERE is_public=1').get().c;

  const viewerId = req.user?.userId || null;

  const notes = rows.map(r => {
    const reactions = db.prepare(
      'SELECT emoji, COUNT(*) as c FROM note_reactions WHERE note_id=? GROUP BY emoji'
    ).all(r.id);

    const replyCount = db.prepare(
      'SELECT COUNT(*) as c FROM replies WHERE note_id=?'
    ).get(r.id).c;

    let userReactions = [];
    if (viewerId) {
      userReactions = db.prepare(
        "SELECT emoji FROM note_reactions WHERE note_id=? AND reactor_key=?"
      ).all(r.id, viewerId).map(x => x.emoji);
    }

    let isFollowing = false;
    if (viewerId && viewerId !== r.author_id) {
      isFollowing = !!db.prepare(
        'SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?'
      ).get(viewerId, r.author_id);
    }

    return {
      id:          r.id,
      title:       r.title,
      body:        r.body,
      font:        r.font,
      fontSize:    r.font_size,
      bgUrl:       r.bg_url || '',
      colorIdx:    r.color_idx,
      tags:        JSON.parse(r.tags || '[]'),
      createdAt:   r.created_at,
      views:       r.views,
      reactions,
      replyCount,
      userReactions,
      author: {
        id:          r.author_id,
        username:    r.username,
        displayName: r.display_name || r.username,
        avatarUrl:   r.avatar_url  || '',
        isFollowing,
      },
    };
  });

  res.json({ notes, total, page, limit });
});

module.exports = router;
