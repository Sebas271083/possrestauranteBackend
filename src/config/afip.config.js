export const afipConfig = {
  homo: String(process.env.AFIP_HOMO).toLowerCase() === "true",
  cuit: process.env.AFIP_CUIT,
  ptoVta: Number(process.env.AFIP_PTO_VTA || 1),
  cbteTipoDefault: Number(process.env.AFIP_CBTE_TIPO || 11), // default C
  cacheTokensPath: process.env.AFIP_TOKENS_CACHE || "./var/afip_tokens.json",
  certPath: process.env.AFIP_CERT_PATH,
  keyPath: process.env.AFIP_KEY_PATH
};
