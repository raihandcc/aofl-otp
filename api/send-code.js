const twilio = require('twilio');
const normalize = input => {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (ten.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return '+1' + ten;
};
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
  const phone = normalize(req.body?.phone);
  const method = req.body?.method;
  if (!phone || !['sms','call'].includes(method)) return res.status(400).json({success:false,error:'Invalid phone or method'});
  const {TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID} = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) return res.status(503).json({success:false,error:'Service not configured'});
  try {
    const client = twilio(TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN);
    const verification = await client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({to:phone,channel:method});
    return res.status(200).json({success:true,status:verification.status});
  } catch (err) {
    console.error('Twilio send failed',err.code || err.name);
    return res.status(502).json({success:false,error:'Unable to send code. Please try again later.'});
  }
};
