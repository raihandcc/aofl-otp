
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

export default async function handler(req, res) {
  // CORS for testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { phone, code } = req.body || {};
    const formattedPhone = normalizePhone(phone);

    if (!formattedPhone) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number."
      });
    }

    const otp = String(code || "").trim();

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid 6-digit verification code."
      });
    }

    const result = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: formattedPhone,
        code: otp
      });

    if (result.status === "approved") {
      return res.status(200).json({
        success: true,
        verified: true,
        status: "approved"
      });
    }

    return res.status(400).json({
      success: false,
      verified: false,
      error: "Incorrect or expired verification code."
    });

  } catch (error) {
    console.error("Twilio verify error:", error.code, error.message);

    return res.status(500).json({
      success: false,
      verified: false,
      error: "Unable to verify code. Please try again."
    });
  }
}
