import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class PurchaseOrder extends Model {}
PurchaseOrder.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  supplier_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM("draft","sent","partially_received","received","cancelled"), allowNull: false, defaultValue: "draft" },
  ref_number: { type: DataTypes.STRING(60) }, // nro interno de OC
  notes: { type: DataTypes.STRING(255) },
  total_estimated: { type: DataTypes.DECIMAL(12,2), defaultValue: "0.00" }
}, { sequelize, tableName: "purchase_orders", underscored: true, paranoid: true });

export { PurchaseOrder };
