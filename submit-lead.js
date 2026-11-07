
import crypto from 'node:crypto';

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

function validateToken(token, phone, secret) {
  if (typeof token !== 'string' || token.length > 2000) {
    return false;
  }

  const [payload, signature, extra] = token.split('.');

  if (!payload || !signature || extra) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest();

  let provided;

  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    return (
      data.phone === phone &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now() &&
      data.exp < Date.now() + 11 * 60 * 1000
    );

  } catch {
    return false;
  }
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
    const body = req.body || {};

    const phone = phoneNumber(
      body.phone || body.lead?.phone
    );

    const secret = process.env.AOFL_WEBHOOK_SECRET;

    if (!secret || !process.env.GOOGLE_SCRIPT_URL) {
      throw new Error('Missing environment configuration');
    }

    const verificationToken =
      body.verification?.verificationToken;

    if (!phone || !validateToken(
      verificationToken,
      phone,
      secret
    )) {
      return res.status(403).json({
        success: false,
        error: 'Phone verification expired or invalid. Please request a new code.'
      });
    }

    const name = String(body.name || '')
      .trim()
      .slice(0, 200);

    const email = String(body.email || '')
      .trim()
      .slice(0, 254);

    if (
      !name ||
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Name and valid email required'
      });
    }

    const answers =
      body.qualification || body.answers || {};

    const scriptResponse = await fetch(
      process.env.GOOGLE_SCRIPT_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          secret,
          phone,
          name,
          email,
          answers,
          tracking: body.tracking || {},
          source: body.source || 'aofl-french-form'
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(20000)
      }
    );

    const responseText = await scriptResponse.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error('Apps Script returned invalid JSON');
    }

    if (!scriptResponse.ok || result.success !== true) {
      throw new Error('Google Sheets submission failed');
    }

    return res.status(200).json({
      success: true,
      status: result.status
    });

  } catch (error) {
    console.error('AOFL lead submission error:', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to save lead. Please try again.'
    });
  }
}
