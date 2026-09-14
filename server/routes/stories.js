/**
 * Stories — 24-hour Instagram-style posts.
 *
 * A "story" is a note with is_story=1 and story_expires_at set to +24h from creation.
 * Expired stories are hidden from feeds but not deleted (user keeps them as private notes).
 *
 * GET  /api/stories/feed        — active stories of users the current user follows (+ own)
 * GET  /api/stories/user/:uid   — active stories for a specific user
 * PUT  /api/notes/:id/story     — toggle is_story on an existing note (handled in notes.js)
 */

const router = require('express').Router();
const db     = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

function storyNow() { return new Date().toISOString(); }

function buildStory(row) {
  const mediaRows = db.prepare(
    'SELECT id, filename, mimetype FROM media WHERE note_id=? ORDER BY sort_order ASC'
  ).all(row.id);
  const media = mediaRows.map(m => ({ id: m.id, url: '/uploads/' + m.filename, mimetype: m.mimetype }));

  return {
    id:             row.id,
    userId:         row.user_id,
    title:          row.title,
    body:           row.body,
    font:           row.font,
    colorIdx:       row.color_idx,
    bgUrl:          row.bg_url || '',
    createdAt:      row.created_at,
    storyExpiresAt: row.story_expires_at,
    media,
    author: {
      id:          row.author_id,
      username:    row.author_username,
      displayName: row.author_display_name,
      avatarUrl:   row.author_avatar_url || '',
    },
  };
}

const STORY_SELECT = `
  SELECT n.*,
    u.id           AS author_id,
    u.username     AS author_username,
    u.display_name AS author_display_name,
    u.avatar_url   AS author_avatar_url
  FROM notes n
  JOIN users u ON u.id = n.user_id
  WHERE n.is_story = 1
    AND n.story_expires_at > ?
`;

// GET /api/stories/feed — all public active stories (own first, then others)
router.get('/feed', optionalAuth, (req, res) => {
  const now    = storyNow();
  const userId = req.user?.userId;

  let rows;
  if (userId) {
    // Show ALL public stories; own stories first, then everyone else's
    rows = db.prepare(`
      ${STORY_SELECT}
        AND n.is_public = 1
      ORDER BY
        CASE WHEN n.user_id = ? THEN 0 ELSE 1 END,
        n.created_at DESC
    `).all(now, userId);
  } else {
    // guest: all public stories
    rows = db.prepare(`
      ${STORY_SELECT}
        AND n.is_public = 1
      ORDER BY n.created_at DESC
      LIMIT 30
    `).all(now);
  }

  // Group by user
  const byUser = {};
  rows.forEach(r => {
    const uid = r.user_id;
    if (!byUser[uid]) byUser[uid] = { author: { id: r.author_id, username: r.author_username, displayName: r.author_display_name, avatarUrl: r.author_avatar_url || '' }, stories: [] };
    byUser[uid].stories.push(buildStory(r));
  });

  res.json({ groups: Object.values(byUser) });
});

// GET /api/stories/user/:userId — active stories for one user
router.get('/user/:userId', optionalAuth, (req, res) => {
  const now  = storyNow();
  const rows = db.prepare(`
    ${STORY_SELECT}
      AND n.user_id = ?
    ORDER BY n.created_at ASC
  `).all(now, req.params.userId);
  res.json({ stories: rows.map(buildStory) });
});

module.exports = router;
