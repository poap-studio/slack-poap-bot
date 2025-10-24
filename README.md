# Slack POAP Bot

A Node.js Slack bot that automatically delivers POAP (Proof of Attendance Protocol) NFTs to users when they receive a certain number of reactions on their messages.

## Features

- **Automatic POAP Delivery**: Users receive POAPs when their messages get 3+ reactions (configurable)
- **Channel-Specific Rules**: Configure different POAP events for different channels
- **Email Integration**: POAPs are delivered via email with claim links
- **Admin Commands**: Slack commands to view stats and manage rules
- **REST API**: HTTP endpoints for managing POAP rules
- **Production Ready**: Built with deployment considerations

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in your values:
   - Slack tokens (already configured)
   - Email SMTP settings
   - POAP API credentials (optional for testing)

3. **Start the bot**:
   ```bash
   npm start
   ```

## Environment Setup

### Required Variables
- `SLACK_ACCESS_TOKEN`: Your Slack bot token
- `SLACK_REFRESH_TOKEN`: Your Slack refresh token

### Optional Variables (for full functionality)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`: Email delivery
- `POAP_API_KEY`: POAP.xyz API access
- `DATABASE_URL`: PostgreSQL for production

## Slack App Configuration

Your Slack app needs these permissions:
- `channels:read` - Read channel information
- `chat:write` - Send messages to users
- `reactions:read` - Read message reactions
- `users:read` - Get user information
- `users:read.email` - Access user email addresses

Event subscriptions needed:
- `reaction_added` - Triggered when reactions are added to messages

Slash commands:
- `/poap-stats` - View delivery statistics
- `/poap-rules` - View active POAP rules

## API Endpoints

- `GET /health` - Health check
- `GET /poap-rules` - List active POAP rules
- `POST /poap-rules` - Create new POAP rule

### Creating POAP Rules

```bash
curl -X POST http://localhost:3001/poap-rules \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "general",
    "reactionThreshold": 3,
    "poapEventId": "your-poap-event-id",
    "poapName": "Slack Engagement POAP"
  }'
```

## How It Works

1. User posts a message in a monitored channel
2. Other users react to the message
3. When reactions reach the threshold (default: 3), the bot:
   - Generates a POAP claim link
   - Sends an email to the user with claim instructions
   - Records the delivery in the database
   - Sends a DM to the user confirming delivery

## Database Schema

The app uses SQLite for development and can use PostgreSQL for production:

- `poap_rules` - Channel-specific POAP configurations
- `message_reactions` - Tracks message reaction counts
- `poap_deliveries` - Records of sent POAPs

## Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Configure `DATABASE_URL` for PostgreSQL
3. Set up proper SMTP credentials
4. Configure POAP API access
5. Use a process manager like PM2

## Development

The bot runs in mock mode when API credentials are not provided:
- Email sending is logged instead of sent
- POAP links are mock URLs
- All functionality can be tested locally

## Support

- Create POAP rules via API
- Monitor logs for debugging
- Use `/poap-stats` to verify deliveries
- Check database for detailed records