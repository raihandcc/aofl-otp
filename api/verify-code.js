
import twilio from 'twilio';
import crypto from 'node:crypto';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const allowedOrigin = process.env.AOFL_FORM_ORIGIN || '*';

function phoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return '+1' + digits;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const phone = phoneNumber(req.body?.phone);
    const code = String(req.body?.code || '');

    if (!phone || !/^\d{4,10}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number or verification code'
      });
    }

    const secret = process.env.AOFL_WEBHOOK_SECRET;

    if (!secret) {
      throw new Error('Missing server secret');
    }

    const result = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phone,
        code
      });

    if (result.status !== 'approved') {
      return res.status(403).json({
        success: false,
        status: result.status,
        error: 'Incorrect verification code'
      });
    }

    const payload = Buffer.from(
      JSON.stringify({
        phone,
        exp: Date.now() + 10 * 60 * 1000
      })
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');

    return res.status(200).json({
      success: true,
      status: 'approved',
      verificationToken: payload + '.' + signature
    });

  } catch (error) {
    console.error('OTP verification error:', error);

    return res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
}
