require('dotenv').config();
const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const Database = require('../src/database');
const EmailService = require('../src/emailService');
const PoapService = require('../src/poapService');

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
server.use(express.urlencoded({ extended: true }));
// Static files served by Vercel routing

// Handle slash commands directly
server.post('/slack/events', async (req, res) => {
  const { type, challenge, event, command, text, user_id, channel_id } = req.body;
  
  console.log('Received request:', { type, command, event: !!event });
  
  // Handle URL verification
  if (type === 'url_verification') {
    return res.json({ challenge });
  }
  
  // Handle slash commands directly
  if (command) {
    console.log('Processing slash command:', command);
    
    try {
      let response = '';
      
      switch (command) {
        case '/poap-admin':
          response = {
            text: '🔧 POAP Bot Admin Panel\n\n' +
                  '🌐 Web Interface: https://slack-poap-bot.vercel.app/admin\n\n' +
                  '📋 Available Commands:\n' +
                  '• `/poap-stats` - View delivery statistics\n' +
                  '• `/poap-rules` - List active rules\n' +
                  '• `/poap-create` - Create new rule\n' +
                  '• `/poap-admin` - Show this help\n\n' +
                  '💡 Tip: Use the web interface for easier rule management!',
            response_type: 'ephemeral'
          };
          break;
          
        case '/poap-rules':
          const rules = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM poap_rules WHERE is_active = 1', (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          
          if (rules.length === 0) {
            response = {
              text: 'No active POAP rules found.\n\nUse `/poap-create` to create a new rule or visit the admin panel: https://slack-poap-bot.vercel.app/admin',
              response_type: 'ephemeral'
            };
          } else {
            let text = '🏆 Active POAP Rules:\n\n';
            rules.forEach(rule => {
              text += `• Channel: #${rule.channel_id}\n`;
              text += `  Threshold: ${rule.reaction_threshold} reactions\n`;
              text += `  POAP: ${rule.poap_name}\n\n`;
            });
            text += '\nManage rules: https://slack-poap-bot.vercel.app/admin';
            
            response = { text, response_type: 'ephemeral' };
          }
          break;
          
        case '/poap-stats':
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
          
          response = {
            text: `📊 POAP Stats:\n• Total POAPs delivered: ${stats.total_deliveries}\n• Unique recipients: ${stats.unique_users}\n• Different POAP events: ${stats.unique_events}`,
            response_type: 'ephemeral'
          };
          break;
          
        case '/poap-create':
          const args = (text || '').trim().split(' ');
          
          if (args.length < 4) {
            response = {
              text: '❌ Usage: `/poap-create <channel> <threshold> <poap-event-id> <poap-name>`\n\n' +
                    'Example: `/poap-create general 3 event-123 "Community Engagement POAP"`\n\n' +
                    'Or use the web interface: https://slack-poap-bot.vercel.app/admin',
              response_type: 'ephemeral'
            };
          } else {
            const channelId = args[0].replace('#', '');
            const reactionThreshold = parseInt(args[1]);
            const poapEventId = args[2];
            const poapName = args.slice(3).join(' ').replace(/"/g, '');
            
            if (isNaN(reactionThreshold) || reactionThreshold < 1) {
              response = {
                text: '❌ Reaction threshold must be a positive number.',
                response_type: 'ephemeral'
              };
            } else {
              const ruleId = await db.addPoapRule(channelId, reactionThreshold, poapEventId, poapName);
              
              response = {
                text: `✅ POAP rule created successfully!\n\n` +
                      `📍 Channel: #${channelId}\n` +
                      `⚡ Threshold: ${reactionThreshold} reactions\n` +
                      `🎯 POAP: ${poapName}\n` +
                      `🆔 Event ID: ${poapEventId}\n\n` +
                      `Users will now receive this POAP when their messages in #${channelId} get ${reactionThreshold}+ reactions!`,
                response_type: 'in_channel'
              };
            }
          }
          break;
          
        default:
          response = { text: 'Unknown command', response_type: 'ephemeral' };
      }
      
      return res.json(response);
      
    } catch (error) {
      console.error('Slash command error:', error);
      return res.json({
        text: `❌ Error processing command: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }
  
  // Handle events
  if (type === 'event_callback' && event) {
    console.log('🔥 EVENT RECEIVED:', event.type, 'from user:', event.user, 'in channel:', event.item?.channel);
    
    if (event.type === 'reaction_added') {
      // Use existing reaction handling logic
      try {
        const messageTs = event.item.ts;
        const channelId = event.item.channel;
        
        const messageResult = await web.conversations.history({
          channel: channelId,
          latest: messageTs,
          limit: 1,
          inclusive: true
        });
        
        if (!messageResult.messages || messageResult.messages.length === 0) {
          console.log('Message not found');
          return res.sendStatus(200);
        }
        
        const message = messageResult.messages[0];
        const messageAuthor = message.user;
        
        if (!messageAuthor) {
          console.log('Message author not found');
          return res.sendStatus(200);
        }
        
        const channelInfo = await web.conversations.info({ channel: channelId });
        const channelName = channelInfo.channel.name || channelId;
        
        const poapRule = await db.getPoapRuleByChannel(channelName);
        if (!poapRule) {
          console.log(`No POAP rule found for channel: ${channelName}`);
          return res.sendStatus(200);
        }
        
        const reactionsResult = await web.reactions.get({
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
              const userInfo = await web.users.info({ user: messageAuthor });
              const userEmail = userInfo.user.profile.email;
              const userName = userInfo.user.real_name || userInfo.user.name;
              
              if (!userEmail) {
                console.log(`No email found for user ${messageAuthor}`);
                await web.chat.postMessage({
                  channel: messageAuthor,
                  text: `🎉 Congratulations! Your message got ${totalReactions} reactions and earned you a POAP! However, we need your email address to send it. Please update your Slack profile with your email address.`
                });
                return res.sendStatus(200);
              }
              
              const claimLink = await poapService.generateClaimLink(poapRule.poap_event_id, userEmail);
              
              const emailResult = await emailService.sendPoapEmail(userEmail, userName, poapRule.poap_name, claimLink);
              
              if (emailResult.success) {
                await db.markPoapSent(messageTs, messageAuthor);
                await db.recordPoapDelivery(messageAuthor, userEmail, messageTs, channelId, poapRule.poap_event_id, claimLink);
                
                await web.chat.postMessage({
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
    }
    
    return res.sendStatus(200);
  }
  
  res.sendStatus(200);
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

server.delete('/poap-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await new Promise((resolve, reject) => {
      db.db.run('UPDATE poap_rules SET is_active = 0 WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    res.json({ message: 'POAP rule deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin route handled by Vercel routing to admin.html

server.get('/slack-channels', async (req, res) => {
  try {
    const result = await web.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200
    });
    
    const channels = result.channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      is_archived: channel.is_archived
    })).filter(channel => !channel.is_archived);
    
    res.json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
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

// Slash commands now handled directly in /slack/events endpoint above

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
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