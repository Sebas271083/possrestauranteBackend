import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class AuditLog extends Model {}
AuditLog.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  action: { type: DataTypes.STRING(80), allowNull: false },   // ej: "ORDER_ITEM_ADD"
  entity: { type: DataTypes.STRING(80), allowNull: false },   // ej: "OrderItem"
  entity_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  meta: { type: DataTypes.JSON }
}, { sequelize, tableName: "audit_logs", paranoid: true, underscored: true });

export { AuditLog };
