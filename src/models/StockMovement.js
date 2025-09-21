import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

const MOV_TYPES = ["purchase","sale_deduction","adjustment"];

class StockMovement extends Model {}
StockMovement.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  ingredient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  type: { type: DataTypes.ENUM(...MOV_TYPES), allowNull: false },
  qty: { type: DataTypes.DECIMAL(12,3), allowNull: false }, // + compra/ajuste+, - venta/ajuste-
  unit_cost: { type: DataTypes.DECIMAL(12,4), allowNull: false, defaultValue: "0.0000" },
  ref: { type: DataTypes.STRING(120) },     // nro de factura, orderId, etc.
  meta: { type: DataTypes.JSON },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
}, { sequelize, tableName: "stock_movements", paranoid: true, underscored: true, timestamps: false});

export { StockMovement, MOV_TYPES };
