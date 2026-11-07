
import crypto from 'node:crypto';

const PABBLY_URL =
  'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjAwNTZiMDYzMjA0M2M1MjZjNTUzMiI_3D_pc/IjU3NjcwNTZiMDYzNDA0MzM1MjZiNTUzMDUxMzIi_pc';

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }

  return null;
}

function verifyToken(token, phone) {
  const secret = process.env.AOFL_WEBHOOK_SECRET;

  if (!secret || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest();

  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }

  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) return false;

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    return (
      data.phone === phone &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now() &&
      data.exp <= Date.now() + 600000
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    process.env.AOFL_ALLOWED_ORIGIN || '*'
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false });
  }

  try {
    const body = req.body || {};
    const phone = normalizePhone(body.phone);

    if (
      !phone ||
      !verifyToken(
        body.verification?.verificationToken,
        phone
      )
    ) {
      return res.status(403).json({
        success: false,
        error: 'Phone verification required'
      });
    }

    const response = await fetch(PABBLY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: body.name || '',
        email: body.email || '',
        phone,
        qualification: body.answers || {},
        source: 'AOFL French Form',
        submitted_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error('Pabbly returned ' + response.status);
    }

    return res.status(200).json({
      success: true,
      message: 'Lead submitted successfully'
    });

  } catch (error) {
    console.error('Pabbly submission:', error);

    return res.status(502).json({
      success: false,
      error: 'Unable to submit lead'
    });
  }
}
