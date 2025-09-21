import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class Area extends Model {}

Area.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    color: { type: DataTypes.STRING(20), allowNull: true },
    sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { sequelize, tableName: "areas", paranoid: true, underscored: true }
);
