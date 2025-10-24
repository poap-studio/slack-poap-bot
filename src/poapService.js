const axios = require('axios');

class PoapService {
  constructor() {
    this.apiKey = process.env.POAP_API_KEY;
    this.clientId = process.env.POAP_CLIENT_ID;
    this.clientSecret = process.env.POAP_CLIENT_SECRET;
    this.apiUrl = process.env.POAP_API_URL || 'https://api.poap.tech';
    this.authUrl = 'https://auth.accounts.poap.xyz/oauth/token';
    
    // Token cache
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Generate new token
    try {
      console.log('🔑 Generating new POAP access token...');
      
      const response = await axios.post(this.authUrl, {
        audience: 'https://api.poap.tech',
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 23 hours (token lasts 24h, refresh 1h early)
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      
      console.log('✅ POAP access token generated successfully');
      return this.accessToken;
      
    } catch (error) {
      console.error('❌ Error generating POAP access token:', error.response?.data || error.message);
      throw new Error('Failed to get POAP access token');
    }
  }

  async generateClaimLink(eventId, recipientEmail) {
    if (!this.apiKey || !this.clientId || !this.clientSecret) {
      console.log(`Mock: Would generate POAP claim link for event ${eventId} and email ${recipientEmail}`);
      return `https://poap.xyz/claim/mock-${eventId}-${Date.now()}`;
    }

    try {
      const accessToken = await this.getAccessToken();
      
      console.log(`🎯 Generating real POAP claim link for event ${eventId}`);
      
      const response = await axios.post(
        `${this.apiUrl}/actions/claim-qr`,
        {
          event_id: parseInt(eventId),
          recipient: recipientEmail,
        },
        {
          headers: {
            'X-API-Key': this.apiKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const claimUrl = response.data.claim_url || response.data.qr_hash;
      console.log(`✅ Real POAP claim link generated: ${claimUrl}`);
      
      return claimUrl;
    } catch (error) {
      console.error('❌ Error generating POAP claim link:', error.response?.data || error.message);
      
      // Fallback to mock link if real API fails
      const fallbackLink = `https://poap.xyz/claim/fallback-${eventId}-${Date.now()}`;
      console.log(`🔄 Using fallback link: ${fallbackLink}`);
      return fallbackLink;
    }
  }

  async getEventDetails(eventId) {
    if (!this.apiKey) {
      return {
        id: eventId,
        name: 'Mock POAP Event',
        description: 'Mock event for testing',
        image_url: 'https://poap.xyz/logo.png'
      };
    }

    try {
      const response = await axios.get(`${this.apiUrl}/events/${eventId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching POAP event details:', error.response?.data || error.message);
      return null;
    }
  }

  async createPoapEvent(eventData) {
    if (!this.apiKey) {
      console.log('Mock: Would create POAP event with data:', eventData);
      return {
        id: `mock-event-${Date.now()}`,
        name: eventData.name,
        description: eventData.description,
      };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/events`, eventData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error creating POAP event:', error.response?.data || error.message);
      throw error;
    }
  }

  async batchMintPoaps(eventId, recipients) {
    if (!this.apiKey) {
      console.log(`Mock: Would batch mint POAPs for event ${eventId} to recipients:`, recipients);
      return recipients.map(recipient => ({
        email: recipient,
        claim_url: `https://poap.xyz/claim/mock-${eventId}-${Date.now()}`
      }));
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/actions/batch-mint`,
        {
          event_id: eventId,
          recipients: recipients,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error batch minting POAPs:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = PoapService;