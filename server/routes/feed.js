const router = require('express').Router();
const db     = require('../db');
const { optionalAuth } = require('../auth');

// ── Smart feed ranking ────────────────────────────────────────────────────────
//
// Score per post (higher = shown first):
//
//   base     = reactions + replies*2 + views*0.05
//   age_h    = hours since created_at  (min 0.5 to avoid div/0)
//   decay    = 1 / age_h^1.3           (half-life ~36h, very recent posts shine)
//   follow   = viewer follows author   → ×3.0 boost
//   unseen   = viewer never reacted    → ×1.5 boost  (already-engaged posts deprioritised)
//
//   score    = (base + 1) * decay * follow * unseen
//
// Guest (no token): follow=1, unseen=1 — pure hotness + recency.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/feed?page=1&limit=20
router.get('/', optionalAuth, (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const viewerId = req.user?.userId || null;

  // ── 0. Pinned tagged posts — posts where this user is tagged, shown first ──
  // NOTE: tagged posts appear in feed regardless of is_public — the tag itself
  // makes them visible exclusively to the tagged user.
  let pinnedNotes = [];
  if (viewerId && page === 1) {
    const taggedRows = db.prepare(`
      SELECT n.id, n.title, n.body, n.font, n.font_size, n.bg_url, n.tags,
             n.created_at, n.views, n.color_idx, n.tagged_user_id,
             u.id AS author_id, u.username, u.display_name, u.avatar_url,
             (SELECT COUNT(*) FROM note_reactions WHERE note_id=n.id) AS reaction_count,
             (SELECT COUNT(*) FROM replies WHERE note_id=n.id) AS reply_count
      FROM notes n JOIN users u ON u.id=n.user_id
      WHERE n.tagged_user_id=?
        AND (n.is_story=0 OR n.is_story IS NULL)
      ORDER BY n.created_at DESC
      LIMIT 10
    `).all(viewerId);
    pinnedNotes = taggedRows;
  }
  const pinnedIds = new Set(pinnedNotes.map(r => r.id));

  // ── 1. Fetch all candidate public notes (not stories) ──────────────────────
  const CANDIDATE_LIMIT = 500;

  const rows = db.prepare(`
    SELECT n.id, n.title, n.body, n.font, n.font_size, n.bg_url, n.tags,
           n.created_at, n.views, n.color_idx, n.tagged_user_id,
           u.id   AS author_id,
           u.username,
           u.display_name,
           u.avatar_url,
           (SELECT COUNT(*) FROM note_reactions  WHERE note_id = n.id)           AS reaction_count,
           (SELECT COUNT(*) FROM replies         WHERE note_id = n.id)           AS reply_count
    FROM   notes n
    JOIN   users u ON u.id = n.user_id
    WHERE  n.is_public = 1
      AND  (n.is_story = 0 OR n.is_story IS NULL)
      AND  (n.tagged_user_id = '' OR n.tagged_user_id IS NULL OR n.tagged_user_id = ?)
    ORDER  BY n.created_at DESC
    LIMIT  ?
  `).all(viewerId || '', CANDIDATE_LIMIT);

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM notes
    WHERE  is_public = 1 AND (is_story = 0 OR is_story IS NULL)
      AND  (tagged_user_id = '' OR tagged_user_id IS NULL OR tagged_user_id = ?)
  `).get(viewerId || '').c;

  // ── 2. Gather viewer-specific sets (follows + already-reacted notes) ────────
  let followedSet  = new Set(); // author IDs the viewer follows
  let reactedSet   = new Set(); // note IDs the viewer already reacted to

  if (viewerId) {
    db.prepare('SELECT followee_id FROM follows WHERE follower_id = ?')
      .all(viewerId)
      .forEach(r => followedSet.add(r.followee_id));

    db.prepare(`
      SELECT DISTINCT note_id FROM note_reactions
      WHERE reactor_key = ?
    `).all('u:' + viewerId)
      .forEach(r => reactedSet.add(r.note_id));
  }

  // ── 3. Score every candidate ────────────────────────────────────────────────
  const now = Date.now();

  const scored = rows.map(r => {
    const ageMs  = now - new Date(r.created_at).getTime();
    const ageH   = Math.max(0.5, ageMs / 3_600_000);

    const base   = r.reaction_count + r.reply_count * 2 + r.views * 0.05;
    const decay  = 1 / Math.pow(ageH, 1.3);
    const follow = followedSet.has(r.author_id) ? 3.0 : 1.0;
    const unseen = reactedSet.has(r.id)         ? 0.6 : 1.5;

    const score  = (base + 1) * decay * follow * unseen;

    return { r, score };
  });

  // ── 4. Sort by score descending, then slice the requested page ──────────────
  scored.sort((a, b) => b.score - a.score);
  const pageSlice = scored.slice(offset, offset + limit);

  // ── 5. Build response — enrich each note with per-viewer data ───────────────
  function enrichNote(r) {
    const reactions = db.prepare(
      'SELECT emoji, COUNT(*) AS c FROM note_reactions WHERE note_id=? GROUP BY emoji'
    ).all(r.id);

    let userReactions = [];
    if (viewerId) {
      userReactions = db.prepare(
        'SELECT emoji FROM note_reactions WHERE note_id=? AND reactor_key=?'
      ).all(r.id, 'u:' + viewerId).map(x => x.emoji);
    }

    const isFollowing = viewerId && viewerId !== r.author_id
      ? followedSet.has(r.author_id)
      : false;

    // Resolve taggedUser info if any
    let taggedUser = null;
    if (r.tagged_user_id) {
      const tu = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id=?').get(r.tagged_user_id);
      if (tu) taggedUser = { id: tu.id, username: tu.username, displayName: tu.display_name || tu.username, avatarUrl: tu.avatar_url || '' };
    }

    // tag-view status for the tagged user (only relevant when viewerId === tagged_user_id)
    let tagViewStatus = null;
    if (viewerId && r.tagged_user_id && viewerId === r.tagged_user_id) {
      const tvRec = db.prepare('SELECT duration_s, view_count, notified FROM note_tag_views WHERE note_id=? AND viewer_id=?').get(r.id, viewerId);
      tagViewStatus = tvRec ? { durationS: tvRec.duration_s, viewCount: tvRec.view_count, notified: !!tvRec.notified } : null;
    }

    return {
      id:            r.id,
      title:         r.title,
      body:          r.body,
      font:          r.font,
      fontSize:      r.font_size,
      bgUrl:         r.bg_url || '',
      colorIdx:      r.color_idx,
      tags:          JSON.parse(r.tags || '[]'),
      createdAt:     r.created_at,
      views:         r.views,
      reactions,
      replyCount:    r.reply_count,
      userReactions,
      taggedUserId:  r.tagged_user_id || '',
      taggedUser,
      tagViewStatus,
      isPinnedTag:   !!(r.tagged_user_id && viewerId === r.tagged_user_id),
      author: {
        id:          r.author_id,
        username:    r.username,
        displayName: r.display_name || r.username,
        avatarUrl:   r.avatar_url  || '',
        isFollowing,
      },
    };
  }

  const notes = [
    ...pinnedNotes.map(r => enrichNote(r)),
    ...pageSlice.filter(({ r }) => !pinnedIds.has(r.id)).map(({ r }) => enrichNote(r)),
  ];

  res.json({ notes, total, page, limit });
});

module.exports = router;
