const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth, checkPassword } = require('../auth');
const { getUserPlan } = require('../subscription');
const { moderateText, checkPostQuality } = require('../moderation');
const { creditWallet } = require('./wallet');
let _emitToUser = null;
try { _emitToUser = require('../ws').emitToUser; } catch {}
const emitToUser = (uid, type, payload) => { try { _emitToUser?.(uid, type, payload); } catch {} };

// ── helpers ────────────────────────────────────────────────────────────────────
function getReactorKey(req) {
  if (req.user?.userId) return 'u:' + req.user.userId;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'guest';
  const ua = req.headers['user-agent'] || 'generic';
  return 'g:' + clientIp + ':' + ua.slice(0, 40);
}

function getNoteReactions(noteId, currentReactorKey) {
  const counts = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM note_reactions
    WHERE note_id = ?
    GROUP BY emoji
    ORDER BY count DESC
  `).all(noteId);

  const userReacts = currentReactorKey ? db.prepare(`
    SELECT emoji
    FROM note_reactions
    WHERE note_id = ? AND reactor_key = ?
  `).all(noteId, currentReactorKey).map(r => r.emoji) : [];

  return {
    reactions: Object.fromEntries(counts.map(r => [r.emoji, r.count])),
    userReactions: userReacts,
  };
}

function getReplyReactions(replyId, currentReactorKey) {
  const counts = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM reply_reactions
    WHERE reply_id = ?
    GROUP BY emoji
    ORDER BY count DESC
  `).all(replyId);

  const userReacts = currentReactorKey ? db.prepare(`
    SELECT emoji
    FROM reply_reactions
    WHERE reply_id = ? AND reactor_key = ?
  `).all(replyId, currentReactorKey).map(r => r.emoji) : [];

  return {
    reactions: Object.fromEntries(counts.map(r => [r.emoji, r.count])),
    userReactions: userReacts,
  };
}

function buildNote(row, req, authorUser) {
  const reactorKey = req ? getReactorKey(req) : null;
  const { reactions, userReactions } = getNoteReactions(row.id, reactorKey);
  const replies = db.prepare('SELECT * FROM replies WHERE note_id = ? ORDER BY created_at ASC').all(row.id);
  const media   = db.prepare('SELECT id, filename, mimetype FROM media WHERE note_id = ? ORDER BY sort_order ASC').all(row.id);
  
  const repliesWithReactions = replies.map(r => {
    const rReactData = getReplyReactions(r.id, reactorKey);
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      text: r.text,
      createdAt: r.created_at,
      reactions: rReactData.reactions,
      userReactions: rReactData.userReactions,
    };
  });

  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }

  // Resolve music URL: note_music_id → music_library (global) OR user_music_library
  let resolvedMusicUrl = row.music_url || '';
  if (!resolvedMusicUrl && row.note_music_id) {
    const globalTrack = db.prepare('SELECT filename FROM music_library WHERE id = ?').get(row.note_music_id);
    if (globalTrack) {
      resolvedMusicUrl = '/music-library/' + globalTrack.filename;
    } else {
      const userTrack = db.prepare('SELECT filename FROM user_music_library WHERE id = ?').get(row.note_music_id);
      if (userTrack) resolvedMusicUrl = '/user-music/' + userTrack.filename;
    }
  }

  // resolve tagged user info
  let taggedUser = null;
  if (row.tagged_user_id) {
    const tu = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id=?').get(row.tagged_user_id);
    if (tu) taggedUser = { id: tu.id, username: tu.username, displayName: tu.display_name || tu.username, avatarUrl: tu.avatar_url || '' };
  }

  const noteObj = {
    id:            row.id,
    userId:        row.user_id,
    title:         row.title,
    body:          row.body,
    font:          row.font,
    titleFont:     row.title_font || '',
    fontSize:      row.font_size,
    fontWeight:    row.font_weight,
    colorIdx:      row.color_idx,
    musicUrl:      resolvedMusicUrl,
    bgUrl:         row.bg_url || '',
    noteMusicId:   row.note_music_id || '',
    tags:          tags,
    views:         row.views,
    pinned:        row.pinned ? true : false,
    isPublic:      !!row.is_public,
    isStory:       !!row.is_story,
    storyExpiresAt: row.story_expires_at || null,
    taggedUserId:  row.tagged_user_id || '',
    taggedUser,
    createdAt:     row.created_at,
    editedAt:      row.edited_at,
    reactions:     reactions,
    userReactions: userReactions,
    replies:       repliesWithReactions,
    media:         media.map(m => ({ id: m.id, url: '/uploads/' + m.filename, mimetype: m.mimetype })),
    ttsVoice:      row.tts_voice || 'female',
    ttsTone:       row.tts_tone  || 'auto',
  };

  if (authorUser) {
    noteObj.user = {
      id: authorUser.id,
      username: authorUser.username,
      displayName: authorUser.display_name,
      bio: authorUser.bio,
      avatarUrl: authorUser.avatar_url || '',
      isProtected: !!authorUser.share_protected,
    };
  }

  return noteObj;
}

// ── shared helper: load diary notes for a resolved user row ─────────────────
async function loadPublicDiary(req, res, user) {
  const isOwner = req.user && req.user.userId === user.id;

  // Check password protection if enabled and visitor is not the owner
  if (user.share_protected && !isOwner) {
    const providedPass = req.headers['x-share-password'] || req.query.pass || '';
    let passMatch = false;
    if (providedPass && user.share_password_hash) {
      passMatch = await checkPassword(providedPass, user.share_password_hash);
    }
    if (!passMatch) {
      return res.status(403).json({
        isProtected: true,
        error: 'Password required to access this diary',
        user: { id: user.id, username: user.username, displayName: user.display_name, bio: user.bio, avatarUrl: user.avatar_url || '', shareToken: user.share_token || '' }
      });
    }
  }

  const { from, to } = req.query;
  const viewerId = req.user?.userId || null;

  // Determine if visitor has diary-access grant from owner
  const hasAccessGrant = !isOwner && viewerId
    ? !!db.prepare('SELECT id FROM diary_access WHERE owner_id=? AND grantee_id=?').get(user.id, viewerId)
    : false;

  // Visitors see: public notes + (if access-granted) private notes too
  // Owner sees all notes
  let sql;
  if (isOwner) {
    sql = 'SELECT * FROM notes WHERE user_id = ?';
  } else if (hasAccessGrant) {
    sql = 'SELECT * FROM notes WHERE user_id = ?';
  } else {
    sql = 'SELECT * FROM notes WHERE user_id = ? AND is_public = 1';
  }
  const params = [user.id];
  if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
  if (to)   { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      bio: user.bio,
      avatarUrl: user.avatar_url || '',
      isProtected: !!user.share_protected,
      shareToken: user.share_token || '',
      hasAccessGrant,
    },
    notes: rows.map(r => buildNote(r, req))
  });
}

// GET /api/notes/user/:username  — public diary page for a user (legacy)
router.get('/user/:username', optionalAuth, async (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio, avatar_url, share_protected, share_password_hash, share_token FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  return loadPublicDiary(req, res, user);
});

// GET /api/notes/s/:token  — public diary page by opaque share token (no username in URL)
// Also accepts userId as fallback (old links that used userId instead of share_token)
router.get('/s/:token', optionalAuth, async (req, res) => {
  const t = req.params.token;
  const user = db.prepare('SELECT id, username, display_name, bio, avatar_url, share_protected, share_password_hash, share_token FROM users WHERE share_token = ? OR id = ?').get(t, t);
  if (!user) return res.status(404).json({ error: 'Diary not found' });
  return loadPublicDiary(req, res, user);
});

// GET /api/notes  — get current user's notes (must be logged in)
router.get('/', verifyToken, (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM notes WHERE user_id = ?';
  const params = [req.user.userId];
  if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
  if (to)   { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => buildNote(r, req)));
});

// GET /api/notes/:id
router.get('/:id', optionalAuth, async (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const author = db.prepare('SELECT id, username, display_name, bio, avatar_url, share_protected, share_password_hash, share_token FROM users WHERE id = ?').get(row.user_id);
  const isOwner = req.user && req.user.userId === row.user_id;

  // Check password protection if enabled and visitor is not the owner
  if (author && author.share_protected && !isOwner) {
    const providedPass = req.headers['x-share-password'] || req.query.pass || '';
    let passMatch = false;
    if (providedPass && author.share_password_hash) {
      passMatch = await checkPassword(providedPass, author.share_password_hash);
    }
    if (!passMatch) {
      return res.status(403).json({
        isProtected: true,
        error: 'Password required to view this entry',
        user: { id: author.id, username: author.username, displayName: author.display_name, bio: author.bio, avatarUrl: author.avatar_url || '', shareToken: author.share_token || '' }
      });
    }
  }

  // increment views only for non-owners
  if (!isOwner) {
    db.prepare('UPDATE notes SET views = views + 1 WHERE id = ?').run(req.params.id);
    row.views += 1;
  }
  res.json(buildNote(row, req, author));
});

// POST /api/notes  (owner only)
router.post('/', verifyToken, (req, res) => {
  const { title, body, font, titleFont, fontSize, fontWeight, colorIdx, musicUrl, tags, bgUrl, noteMusicId, ttsVoice, ttsTone, taggedUserId } = req.body;
  if (!title && !body) return res.status(400).json({ error: 'Title or body required' });

  const plan = getUserPlan(req.user.userId);
  if (plan.notesLimit !== -1) {
    const count = db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?').get(req.user.userId).c;
    if (count >= plan.notesLimit) {
      return res.status(403).json({
        error: `Free plan limit reached (${plan.notesLimit} entries). Upgrade to Pro for unlimited entries.`,
        limitReached: true, plan: plan.planId,
      });
    }
  }
  // validate taggedUserId
  const taggedId = (taggedUserId && taggedUserId !== req.user.userId)
    ? (db.prepare('SELECT id FROM users WHERE id=?').get(taggedUserId) ? taggedUserId : '')
    : '';

  const id = uuidv4();
  const now = new Date().toISOString();
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
  db.prepare(`
    INSERT INTO notes (id, user_id, title, body, font, title_font, font_size, font_weight, color_idx, music_url, tags, bg_url, note_music_id, tts_voice, tts_tone, tagged_user_id, views, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, req.user.userId, title || '', body || '', font || "'Kalam',cursive", titleFont || '',
         fontSize || 14, fontWeight || 'normal', colorIdx ?? 0, musicUrl || '', tagsJson,
         bgUrl || '', noteMusicId || '', ttsVoice || 'female', ttsTone || 'auto', taggedId, now);

  // Do NOT notify the tagged user — the post is intentionally hidden.
  // They'll find it naturally in their feed. Only the owner gets notified
  // later via tagged_seen / tagged_no_response when the tagged user views it.

  res.status(201).json(buildNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(id), req));
});

// PUT /api/notes/:id  (owner only)
router.put('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  const { title, body, font, titleFont, fontSize, fontWeight, colorIdx, musicUrl, tags, bgUrl, noteMusicId, ttsVoice, ttsTone, taggedUserId } = req.body;
  const tagsJson = tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags : []) : row.tags;

  // validate taggedUserId if provided
  let taggedId = row.tagged_user_id || '';
  if (taggedUserId !== undefined) {
    taggedId = (taggedUserId && taggedUserId !== req.user.userId)
      ? (db.prepare('SELECT id FROM users WHERE id=?').get(taggedUserId) ? taggedUserId : '')
      : '';
  }

  db.prepare(`
    UPDATE notes SET title=?, body=?, font=?, title_font=?, font_size=?, font_weight=?, color_idx=?, music_url=?, tags=?, bg_url=?, note_music_id=?, tts_voice=?, tts_tone=?, tagged_user_id=?, edited_at=?
    WHERE id=?
  `).run(title ?? row.title, body ?? row.body, font ?? row.font,
         titleFont !== undefined ? titleFont : (row.title_font ?? ''),
         fontSize ?? row.font_size, fontWeight ?? row.font_weight,
         colorIdx ?? row.color_idx, musicUrl ?? row.music_url,
         tagsJson, bgUrl ?? row.bg_url ?? '', noteMusicId ?? row.note_music_id ?? '',
         ttsVoice ?? row.tts_voice ?? 'female', ttsTone ?? row.tts_tone ?? 'auto',
         taggedId, new Date().toISOString(), req.params.id);
  res.json(buildNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id), req));
});

// ── POST /api/notes/:id/tag-view  — record tagged user viewing the post ───────
// Called by the client with { durationSec } when the tagged user views/skips the post
router.post('/:id/tag-view', verifyToken, (req, res) => {
  const note = db.prepare('SELECT id, user_id, tagged_user_id FROM notes WHERE id=?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.tagged_user_id !== req.user.userId) return res.status(403).json({ error: 'Not tagged user' });

  const { durationSec } = req.body;
  const dur = parseFloat(durationSec) || 0;
  const now = new Date().toISOString();
  const authorId = note.user_id;

  // upsert view record
  const existing = db.prepare('SELECT * FROM note_tag_views WHERE note_id=? AND viewer_id=?').get(note.id, req.user.userId);
  if (existing) {
    db.prepare('UPDATE note_tag_views SET duration_s=duration_s+?, view_count=view_count+1, updated_at=? WHERE id=?')
      .run(dur, now, existing.id);
  } else {
    db.prepare('INSERT INTO note_tag_views (id,note_id,viewer_id,duration_s,view_count,notified,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)')
      .run(uuidv4(), note.id, req.user.userId, dur, now, now);
  }

  // re-fetch updated record
  const rec = db.prepare('SELECT * FROM note_tag_views WHERE note_id=? AND viewer_id=?').get(note.id, req.user.userId);

  const totalDur  = rec.duration_s;
  const viewCount = rec.view_count;

  // notified=1 means we sent *some* notification already.
  // Allow 'tagged_seen' to fire even if we previously sent 'tagged_no_response'
  // so the owner knows the person eventually read it properly.
  // But don't re-fire the same type twice.
  const alreadyNotified = !!rec.notified;

  let notifType = null;
  if (totalDur >= 5) {
    // Seen — 5+ seconds total across all views
    // Only fire if we haven't sent tagged_seen before (notified flag covers both types;
    // check the notifications table to avoid duplicate tagged_seen)
    const hasSeen = alreadyNotified && db.prepare(
      "SELECT id FROM notifications WHERE note_id=? AND recipient_id=? AND type='tagged_seen' LIMIT 1"
    ).get(note.id, authorId);
    if (!hasSeen) notifType = 'tagged_seen';
  } else if (!alreadyNotified && viewCount >= 2 && dur < 2) {
    // Skipped at least twice — this view was also short (< 2s), so no engagement
    notifType = 'tagged_no_response';
  }

  if (notifType) {
    db.prepare('UPDATE note_tag_views SET notified=1 WHERE id=?').run(rec.id);
    const notifId = uuidv4();
    db.prepare('INSERT INTO notifications (id, recipient_id, type, actor_id, note_id, created_at) VALUES (?,?,?,?,?,?)')
      .run(notifId, authorId, notifType, req.user.userId, note.id, now);
    emitToUser(authorId, 'notification', { notification: { id: notifId, type: notifType, actorId: req.user.userId, noteId: note.id, createdAt: now } });
  }

  res.json({ ok: true, notifSent: notifType });
});

// PUT /api/notes/:id/pin  — toggle pin for owner (max 3 pinned per user)
router.put('/:id/pin', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id, pinned FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  if (!row.pinned) {
    // pinning — check limit
    const pinCount = db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND pinned = 1').get(req.user.userId).c;
    if (pinCount >= 3) return res.status(400).json({ error: 'You can pin up to 3 entries. Unpin one first.' });
    db.prepare('UPDATE notes SET pinned = 1 WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('UPDATE notes SET pinned = 0 WHERE id = ?').run(req.params.id);
  }

  const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json({ pinned: !!updated.pinned });
});

// DELETE /api/notes/:id  (owner only)
router.delete('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PUT /api/notes/:id/story  (owner only — toggle is_story, sets 24h expiry)
router.put('/:id/story', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id, is_story FROM notes WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const newVal = req.body.isStory !== undefined ? (req.body.isStory ? 1 : 0) : (row.is_story ? 0 : 1);
  let expiresAt = null;
  if (newVal === 1) {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  db.prepare('UPDATE notes SET is_story=?, story_expires_at=? WHERE id=?').run(newVal, expiresAt, row.id);
  res.json({ isStory: !!newVal, storyExpiresAt: expiresAt });
});

// PUT /api/notes/:id/public  (owner only — toggle is_public)
// When publishing (isPublic → true): runs quality check + AI moderation first.
// If rejected: keeps the note private and returns 422 with the reason.
// First-time publish of a qualifying note → credits ₹1 signup bonus to wallet.
router.put('/:id/public', verifyToken, async (req, res) => {
  const row = db.prepare('SELECT id, user_id, is_public, title, body FROM notes WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const newVal = req.body.isPublic !== undefined ? (req.body.isPublic ? 1 : 0) : (row.is_public ? 0 : 1);
  const wasPublic = !!row.is_public;

  // Run checks only when publishing (0 → 1)
  if (newVal === 1 && !wasPublic) {
    // 1. Quality check — reject dummy/filler text before even running moderation
    const { isProper, reason: qualityReason } = await checkPostQuality(row.title, row.body);
    if (!isProper) {
      db.prepare('UPDATE notes SET moderation_status=?, moderation_reason=? WHERE id=?')
        .run('rejected', qualityReason, row.id);
      return res.status(422).json({
        error: `Your entry doesn't qualify for publishing: ${qualityReason}`,
        qualityRejected: true,
        reason: qualityReason,
      });
    }

    // 2. Safety moderation
    const { allowed, reason: modReason } = await moderateText(row.title, row.body);
    if (!allowed) {
      db.prepare('UPDATE notes SET moderation_status=?, moderation_reason=? WHERE id=?')
        .run('rejected', modReason, row.id);
      return res.status(422).json({
        error: `Your entry can't be published: ${modReason}`,
        moderated: true,
        reason: modReason,
      });
    }
    db.prepare('UPDATE notes SET moderation_status=?, moderation_reason=? WHERE id=?')
      .run('approved', '', row.id);

    // 3. Credit ₹1 to wallet for first publish of a genuine post
    try {
      creditWallet(row.user_id, 100, 'post_publish', row.id); // 100 paise = ₹1
    } catch (e) {
      console.error('[notes/public] wallet credit failed:', e.message);
    }
  }

  db.prepare('UPDATE notes SET is_public=? WHERE id=?').run(newVal, row.id);
  res.json({ isPublic: !!newVal });
});

// POST /api/notes/:id/react  (toggle 1 reaction per user/guest per emoji)
router.post('/:id/react', optionalAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const note = db.prepare('SELECT id, user_id, is_public FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const reactorKey = getReactorKey(req);
  const actorId    = req.user?.userId || null;

  const existing = db.prepare('SELECT id FROM note_reactions WHERE note_id = ? AND emoji = ? AND reactor_key = ?')
                     .get(req.params.id, emoji, reactorKey);
  if (existing) {
    db.prepare('DELETE FROM note_reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO note_reactions (id, note_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), req.params.id, emoji, reactorKey, new Date().toISOString());
    // Notify note owner if public note and actor ≠ owner
    if (note.is_public && actorId && actorId !== note.user_id) {
      const notifId = uuidv4();
      const now     = new Date().toISOString();
      db.prepare('INSERT INTO notifications (id, recipient_id, type, actor_id, note_id, created_at) VALUES (?,?,?,?,?,?)')
        .run(notifId, note.user_id, 'reaction', actorId, note.id, now);
      emitToUser(note.user_id, 'notification', {
        notification: { id: notifId, type: 'reaction', actorId, noteId: note.id, createdAt: now }
      });
    }
  }

  const { reactions, userReactions } = getNoteReactions(req.params.id, reactorKey);
  res.json({ reactions, userReactions, isReacted: !existing });
});

// POST /api/notes/:id/replies  (anyone — optionally logged in)
router.post('/:id/replies', optionalAuth, (req, res) => {
  const { name, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const note = db.prepare('SELECT id, user_id, is_public FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const id      = uuidv4();
  const userId  = req.user?.userId || null;
  const author  = req.user ? null : (name?.trim() || 'Anonymous');
  let displayName = author;
  if (userId) {
    const u = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(userId);
    displayName = u?.display_name || u?.username || 'User';
  }
  db.prepare('INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, note.id, userId, displayName, text.trim(), new Date().toISOString());
  // Notify note owner if public note and actor ≠ owner
  if (note.is_public && userId && userId !== note.user_id) {
    const notifId = uuidv4();
    const now     = new Date().toISOString();
    db.prepare('INSERT INTO notifications (id, recipient_id, type, actor_id, note_id, created_at) VALUES (?,?,?,?,?,?)')
      .run(notifId, note.user_id, 'reply', userId, note.id, now);
    emitToUser(note.user_id, 'notification', {
      notification: { id: notifId, type: 'reply', actorId: userId, noteId: note.id, createdAt: now }
    });
  }
  res.status(201).json({ id, userId, name: displayName, text: text.trim(), createdAt: new Date().toISOString() });
});

// DELETE /api/notes/:noteId/replies/:replyId  (note owner OR reply author)
router.delete('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  const reply = db.prepare('SELECT r.id, r.user_id, n.user_id as note_owner FROM replies r JOIN notes n ON n.id = r.note_id WHERE r.id = ? AND r.note_id = ?')
                  .get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (reply.note_owner !== req.user.userId && reply.user_id !== req.user.userId)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM replies WHERE id = ?').run(req.params.replyId);
  res.json({ success: true });
});

// PUT /api/notes/:noteId/replies/:replyId  (note owner OR reply author)
router.put('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const reply = db.prepare('SELECT r.id, r.user_id, n.user_id as note_owner FROM replies r JOIN notes n ON n.id = r.note_id WHERE r.id = ? AND r.note_id = ?')
                  .get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (reply.note_owner !== req.user.userId && reply.user_id !== req.user.userId)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE replies SET text = ? WHERE id = ?').run(text.trim(), req.params.replyId);
  res.json({ success: true });
});

// POST /api/notes/:noteId/replies/:replyId/react  (toggle 1 reaction per user/guest per emoji)
router.post('/:noteId/replies/:replyId/react', optionalAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const reply = db.prepare('SELECT id FROM replies WHERE id = ? AND note_id = ?').get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  const reactorKey = getReactorKey(req);

  const existing = db.prepare('SELECT id FROM reply_reactions WHERE reply_id = ? AND emoji = ? AND reactor_key = ?')
                     .get(req.params.replyId, emoji, reactorKey);
  if (existing) {
    // toggle off / undo
    db.prepare('DELETE FROM reply_reactions WHERE id = ?').run(existing.id);
  } else {
    // add reaction
    db.prepare('INSERT INTO reply_reactions (id, reply_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), req.params.replyId, emoji, reactorKey, new Date().toISOString());
  }

  const { reactions, userReactions } = getReplyReactions(req.params.replyId, reactorKey);
  res.json({ reactions, userReactions, isReacted: !existing });
});

module.exports = router;
