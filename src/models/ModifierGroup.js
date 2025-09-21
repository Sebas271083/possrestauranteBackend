import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class ModifierGroup extends Model {}

ModifierGroup.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    min_select: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    max_select: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { sequelize, tableName: "modifier_groups", paranoid: true, underscored: true }
);

export { ModifierGroup };
