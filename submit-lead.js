
import crypto from 'node:crypto';

function normalizePhone(value) {
  const d = String(value || '').replace(/\D/g, '');

  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;

  return null;
}

function validToken(token, phone, secret) {
  if (!secret || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return false;
  }

  const [payload, sig] = parts;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest();

  let actual;

  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return false;
  }

  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
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
      Date.now() < data.exp &&
      data.exp <= Date.now() + 10 * 60 * 1000
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
    const {
      phone: rawPhone,
      name,
      email,
      answers,
      verification
    } = req.body || {};

    const phone = normalizePhone(rawPhone);
    const secret = process.env.AOFL_WEBHOOK_SECRET;

    if (
      !phone ||
      !validToken(
        verification?.verificationToken,
        phone,
        secret
      )
    ) {
      return res.status(403).json({
        success: false,
        error: 'Verification expired or invalid. Please request a new code.'
      });
    }

    if (!process.env.GOOGLE_SCRIPT_URL) {
      throw new Error('Missing GOOGLE_SCRIPT_URL');
    }

    const upstream = await fetch(
      process.env.GOOGLE_SCRIPT_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          secret,
          phone,
          name: String(name || '').slice(0, 200),
          email: String(email || '').slice(0, 254),
          answers: answers || {}
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      }
    );

    const body = await upstream.text();

    let result;

    try {
      result = JSON.parse(body);
    } catch {
      throw new Error(
        'Google Script returned non-JSON response: ' +
        upstream.status
      );
    }

    if (!upstream.ok || !result.success) {
      throw new Error(
        'Google Script rejected submission: ' +
        String(result.error || upstream.status)
      );
    }

    return res.status(200).json({
      success: true,
      status: result.status || 'Saved'
    });

  } catch (err) {
    console.error('submit-lead:', err);

    return res.status(502).json({
      success: false,
      error: 'Unable to save lead. Please try again.'
    });
  }
}
