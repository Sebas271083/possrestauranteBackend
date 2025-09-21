import { AuditLog } from "../models/index.js";

export async function audit({ user_id, action, entity, entity_id, meta = null }, t = null) {
  await AuditLog.create({ user_id, action, entity, entity_id, meta }, { transaction: t });
}