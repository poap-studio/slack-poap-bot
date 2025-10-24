const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = process.env.NODE_ENV === 'production' 
      ? '/tmp/slack_poap.db' 
      : path.join(__dirname, '../data/slack_poap.db');
    
    this.db = new sqlite3.Database(dbPath);
    this.initTables();
  }

  initTables() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS poap_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id TEXT NOT NULL,
          reaction_threshold INTEGER NOT NULL DEFAULT 3,
          poap_event_id TEXT NOT NULL,
          poap_name TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS message_reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          reaction_count INTEGER DEFAULT 0,
          poap_sent BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(message_id, user_id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS poap_deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          user_email TEXT NOT NULL,
          message_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          poap_event_id TEXT NOT NULL,
          poap_claim_link TEXT,
          delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        INSERT OR IGNORE INTO poap_rules (channel_id, reaction_threshold, poap_event_id, poap_name)
        VALUES ('general', 3, 'sample-poap-001', 'Slack Engagement POAP')
      `);
    });
  }

  addPoapRule(channelId, reactionThreshold, poapEventId, poapName) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO poap_rules (channel_id, reaction_threshold, poap_event_id, poap_name) VALUES (?, ?, ?, ?)',
        [channelId, reactionThreshold, poapEventId, poapName],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getPoapRuleByChannel(channelId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM poap_rules WHERE channel_id = ? AND is_active = 1',
        [channelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  updateReactionCount(messageId, channelId, userId, reactionCount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO message_reactions 
         (message_id, channel_id, user_id, reaction_count, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [messageId, channelId, userId, reactionCount],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  getMessageReaction(messageId, userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ?',
        [messageId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  markPoapSent(messageId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE message_reactions SET poap_sent = 1 WHERE message_id = ? AND user_id = ?',
        [messageId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  recordPoapDelivery(userId, userEmail, messageId, channelId, poapEventId, claimLink = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO poap_deliveries 
         (user_id, user_email, message_id, channel_id, poap_event_id, poap_claim_link)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, userEmail, messageId, channelId, poapEventId, claimLink],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;