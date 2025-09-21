import speakeasy from "speakeasy";
import qrcode from "qrcode";

export function generateTwoFASecret(label = "POS Resto", account = "usuario") {
  const secret = speakeasy.generateSecret({
    name: `${label} (${account})`
  });
  return { ascii: secret.ascii, base32: secret.base32, otpauth_url: secret.otpauth_url };
}

export async function qrcodeDataURL(otpauthUrl) {
  return qrcode.toDataURL(otpauthUrl);
}

export function verifyTwoFA({ secretBase32, token }) {
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: "base32",
    token,
    window: 1
  });
}
