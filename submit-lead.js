
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { phone, code, name, email, answers } = req.body || {};

    const digits = String(phone || '').replace(/\D/g, '');
    const normalizedPhone =
      digits.length === 10 ? '+1' + digits :
      digits.length === 11 && digits.startsWith('1') ? '+' + digits :
      null;

    if (!normalizedPhone || !/^\d{4,10}$/.test(String(code || ''))) {
      return res.status(400).json({
        success: false,
        error: 'Valid phone and verification code required'
      });
    }

    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: normalizedPhone,
        code: String(code)
      });

    if (check.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Phone verification failed'
      });
    }

    const response = await fetch(process.env.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        secret: process.env.AOFL_WEBHOOK_SECRET,
        phone: normalizedPhone,
        name,
        email,
        answers
      }),
      redirect: 'follow'
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error('Google Sheets submission failed');
    }

    return res.status(200).json({
      success: true,
      message: 'Lead submitted successfully',
      status: result.status
    });

  } catch (error) {
    console.error('Lead submission error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to submit lead'
    });
  }
}
