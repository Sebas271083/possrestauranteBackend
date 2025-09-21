import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class StockCountItem extends Model {}
StockCountItem.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  stock_count_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  ingredient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  counted_qty: { type: DataTypes.DECIMAL(12,3), allowNull: false, defaultValue: "0.000" }
}, { sequelize, tableName: "stock_count_items", underscored: true, paranoid: true });

export { StockCountItem };