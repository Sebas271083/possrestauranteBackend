import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";
import { Unit } from "./Unit.js";

export class Supply extends Model {}
Supply.init({
  name: { type: DataTypes.STRING(150), allowNull: false },
  sku:  { type: DataTypes.STRING(50), unique: true },
  unit_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cost_unit: { type: DataTypes.DECIMAL(10,4), allowNull: false, defaultValue: 0 },
  stock_on_hand: { type: DataTypes.DECIMAL(14,4), allowNull: false, defaultValue: 0 },
  min_level: { type: DataTypes.DECIMAL(14,4), allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { sequelize, modelName: "supply", underscored: true, paranoid: true });

Supply.belongsTo(Unit, { foreignKey: "unit_id" });
Unit.hasMany(Supply, { foreignKey: "unit_id" });
