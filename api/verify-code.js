
import twilio from 'twilio';
import crypto from 'node:crypto';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function cors(res) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    process.env.AOFL_ALLOWED_ORIGIN || '*'
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function normalizePhone(value) {
  const d = String(value || '').replace(/\D/g, '');

  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;

  return null;
}

export default async function handler(req, res) {
  cors(res);

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
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();

    if (!phone || !/^\d{4,10}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone or code'
      });
    }

    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phone,
        code
      });

    if (check.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Incorrect verification code'
      });
    }

    const secret = process.env.AOFL_WEBHOOK_SECRET;

    if (!secret) {
      throw new Error('Missing AOFL_WEBHOOK_SECRET');
    }

    const payload = Buffer.from(
      JSON.stringify({
        phone,
        exp: Date.now() + 10 * 60 * 1000
      }),
      'utf8'
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

  } catch (err) {
    console.error('verify-code:', err);

    return res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
}
