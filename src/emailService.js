const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.warn('Email configuration not found. Email sending will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPoapEmail(userEmail, userName, poapName, claimLink = null) {
    if (!this.transporter) {
      console.log(`Would send POAP email to ${userEmail} for ${poapName}`);
      console.log(`Claim link: ${claimLink || 'To be generated'}`);
      return { success: true, mock: true };
    }

    const subject = `🎉 You've earned a POAP: ${poapName}!`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6C5CE7;">🎉 Congratulations ${userName}!</h1>
        
        <p>You've earned a POAP (Proof of Attendance Protocol) NFT for your engagement in our Slack community!</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">POAP Details:</h3>
          <p><strong>Event:</strong> ${poapName}</p>
          <p><strong>Earned for:</strong> Getting 3+ reactions on your message</p>
        </div>
        
        ${claimLink ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${claimLink}" 
               style="background: #6C5CE7; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Claim Your POAP
            </a>
          </div>
        ` : `
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Note:</strong> Your POAP claim link will be available soon. You'll receive another email with the claim instructions.</p>
          </div>
        `}
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          POAPs are unique digital collectibles that commemorate your participation and achievements. 
          Keep engaging with our community to earn more!
        </p>
        
        <hr style="border: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          This email was sent by the Slack POAP Bot. If you have questions, please reach out to your workspace admin.
        </p>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: userEmail,
        subject: subject,
        html: htmlContent,
      });

      console.log('POAP email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending POAP email:', error);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    if (!this.transporter) {
      return { success: false, error: 'No transporter configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailService;