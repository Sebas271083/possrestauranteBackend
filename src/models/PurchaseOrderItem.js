import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class PurchaseOrderItem extends Model {}
PurchaseOrderItem.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  purchase_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  ingredient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  qty: { type: DataTypes.DECIMAL(12,3), allowNull: false },
  unit_cost: { type: DataTypes.DECIMAL(12,4), allowNull: false }, // costo estimado
  received_qty: { type: DataTypes.DECIMAL(12,3), allowNull: false, defaultValue: "0.000" }
}, { sequelize, tableName: "purchase_order_items", underscored: true, paranoid: true });

export { PurchaseOrderItem };
