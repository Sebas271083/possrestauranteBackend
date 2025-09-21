import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class ModifierOption extends Model {}

ModifierOption.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    group_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    price_delta: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
    sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { sequelize, tableName: "modifier_options", paranoid: true, underscored: true }
);

export { ModifierOption };
