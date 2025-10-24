const axios = require('axios');

class PoapService {
  constructor() {
    this.apiKey = process.env.POAP_API_KEY;
    this.apiUrl = process.env.POAP_API_URL || 'https://api.poap.xyz';
  }

  async generateClaimLink(eventId, recipientEmail) {
    if (!this.apiKey) {
      console.log(`Mock: Would generate POAP claim link for event ${eventId} and email ${recipientEmail}`);
      return `https://poap.xyz/claim/mock-${eventId}-${Date.now()}`;
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/actions/claim-qr`,
        {
          event_id: eventId,
          recipient: recipientEmail,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.claim_url || response.data.qr_hash;
    } catch (error) {
      console.error('Error generating POAP claim link:', error.response?.data || error.message);
      return `https://poap.xyz/claim/fallback-${eventId}-${Date.now()}`;
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