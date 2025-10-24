require('dotenv').config();
const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const Database = require('./src/database');
const EmailService = require('./src/emailService');
const PoapService = require('./src/poapService');

const app = new App({
  token: process.env.SLACK_ACCESS_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN,
});

const web = new WebClient(process.env.SLACK_ACCESS_TOKEN);
const db = new Database();
const emailService = new EmailService();
const poapService = new PoapService();

const server = express();
server.use(express.json());

server.post('/slack/events', (req, res) => {
  const { type, challenge, event } = req.body;
  
  if (type === 'url_verification') {
    return res.json({ challenge });
  }
  
  if (type === 'event_callback' && event) {
    app.processEvent({
      body: req.body,
      headers: req.headers,
      ack: () => res.sendStatus(200)
    });
  } else {
    res.sendStatus(200);
  }
});

server.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

server.get('/poap-rules', async (req, res) => {
  try {
    const rules = await new Promise((resolve, reject) => {
      db.db.all('SELECT * FROM poap_rules WHERE is_active = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

server.post('/poap-rules', async (req, res) => {
  try {
    const { channelId, reactionThreshold, poapEventId, poapName } = req.body;
    const ruleId = await db.addPoapRule(channelId, reactionThreshold, poapEventId, poapName);
    res.json({ id: ruleId, message: 'POAP rule created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.event('reaction_added', async ({ event, client }) => {
  try {
    console.log('Reaction added event:', event);
    
    const messageTs = event.item.ts;
    const channelId = event.item.channel;
    
    const messageResult = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      limit: 1,
      inclusive: true
    });
    
    if (!messageResult.messages || messageResult.messages.length === 0) {
      console.log('Message not found');
      return;
    }
    
    const message = messageResult.messages[0];
    const messageAuthor = message.user;
    
    if (!messageAuthor) {
      console.log('Message author not found');
      return;
    }
    
    const channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel.name || channelId;
    
    const poapRule = await db.getPoapRuleByChannel(channelName);
    if (!poapRule) {
      console.log(`No POAP rule found for channel: ${channelName}`);
      return;
    }
    
    const reactionsResult = await client.reactions.get({
      channel: channelId,
      timestamp: messageTs
    });
    
    let totalReactions = 0;
    if (reactionsResult.message && reactionsResult.message.reactions) {
      totalReactions = reactionsResult.message.reactions.reduce((sum, reaction) => sum + reaction.count, 0);
    }
    
    console.log(`Total reactions: ${totalReactions}, Threshold: ${poapRule.reaction_threshold}`);
    
    await db.updateReactionCount(messageTs, channelId, messageAuthor, totalReactions);
    
    if (totalReactions >= poapRule.reaction_threshold) {
      const existingReaction = await db.getMessageReaction(messageTs, messageAuthor);
      
      if (!existingReaction || !existingReaction.poap_sent) {
        console.log(`Triggering POAP for user ${messageAuthor}`);
        
        try {
          const userInfo = await client.users.info({ user: messageAuthor });
          const userEmail = userInfo.user.profile.email;
          const userName = userInfo.user.real_name || userInfo.user.name;
          
          if (!userEmail) {
            console.log(`No email found for user ${messageAuthor}`);
            await client.chat.postMessage({
              channel: messageAuthor,
              text: `🎉 Congratulations! Your message got ${totalReactions} reactions and earned you a POAP! However, we need your email address to send it. Please update your Slack profile with your email address.`
            });
            return;
          }
          
          const claimLink = await poapService.generateClaimLink(poapRule.poap_event_id, userEmail);
          
          const emailResult = await emailService.sendPoapEmail(userEmail, userName, poapRule.poap_name, claimLink);
          
          if (emailResult.success) {
            await db.markPoapSent(messageTs, messageAuthor);
            await db.recordPoapDelivery(messageAuthor, userEmail, messageTs, channelId, poapRule.poap_event_id, claimLink);
            
            await client.chat.postMessage({
              channel: messageAuthor,
              text: `🎉 Congratulations ${userName}! Your message in #${channelName} got ${totalReactions} reactions and earned you a POAP! Check your email (${userEmail}) for claim instructions.`
            });
            
            console.log(`POAP successfully sent to ${userEmail}`);
          } else {
            console.error('Failed to send POAP email:', emailResult.error);
          }
          
        } catch (userError) {
          console.error('Error processing POAP delivery:', userError);
        }
      }
    }
    
  } catch (error) {
    console.error('Error handling reaction_added event:', error);
  }
});

app.command('/poap-stats', async ({ ack, respond, command }) => {
  await ack();
  
  try {
    const stats = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT poap_event_id) as unique_events
        FROM poap_deliveries
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });
    
    await respond(`📊 POAP Stats:
• Total POAPs delivered: ${stats.total_deliveries}
• Unique recipients: ${stats.unique_users}  
• Different POAP events: ${stats.unique_events}`);
  } catch (error) {
    await respond('Sorry, there was an error fetching POAP stats.');
  }
});

app.command('/poap-rules', async ({ ack, respond, command }) => {
  await ack();
  
  try {
    const rules = await new Promise((resolve, reject) => {
      db.db.all('SELECT * FROM poap_rules WHERE is_active = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (rules.length === 0) {
      await respond('No active POAP rules found.');
      return;
    }
    
    let response = '🏆 Active POAP Rules:\n\n';
    rules.forEach(rule => {
      response += `• Channel: #${rule.channel_id}\n`;
      response += `  Threshold: ${rule.reaction_threshold} reactions\n`;
      response += `  POAP: ${rule.poap_name}\n\n`;
    });
    
    await respond(response);
  } catch (error) {
    await respond('Sorry, there was an error fetching POAP rules.');
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  server.use('/slack/events', app.receiver.app);
  module.exports = server;
} else {
  (async () => {
    try {
      await app.start(PORT);
      console.log(`⚡️ Slack POAP Bot is running on port ${PORT}!`);
      
      server.listen(PORT + 1, () => {
        console.log(`🌐 Admin API server running on port ${PORT + 1}`);
      });
      
      console.log('🔗 Available endpoints:');
      console.log(`  Health check: http://localhost:${PORT + 1}/health`);
      console.log(`  POAP rules: http://localhost:${PORT + 1}/poap-rules`);
      console.log('📱 Available Slack commands:');
      console.log('  /poap-stats - View POAP delivery statistics');
      console.log('  /poap-rules - View active POAP rules');
      
    } catch (error) {
      console.error('Failed to start the app:', error);
      process.exit(1);
    }
  })();
}

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  db.close();
  process.exit(0);
});