import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class ProductModifierGroup extends Model {}
ProductModifierGroup.init({
  product_id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  group_id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { sequelize, tableName: "product_modifier_groups", timestamps: false, underscored: true });
