import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Ingredient extends Model {}
Ingredient.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  sku: { type: DataTypes.STRING(64) },
  unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "unidad" }, // gr, ml, unidad
  stock_qty: { type: DataTypes.DECIMAL(12,3), allowNull: false, defaultValue: "0.000" },
  min_qty: { type: DataTypes.DECIMAL(12,3), allowNull: false, defaultValue: "0.000" }, // alerta
  cost_per_unit: { type: DataTypes.DECIMAL(12,4), allowNull: false, defaultValue: "0.0000" },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { sequelize, tableName: "ingredients", paranoid: true, underscored: true });

export { Ingredient };
