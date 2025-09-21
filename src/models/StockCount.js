import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class StockCount extends Model {}
StockCount.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false },    // ej: "Conteo Septiembre Noche"
  status: { type: DataTypes.ENUM("open","submitted","adjusted"), allowNull: false, defaultValue: "open" },
  notes: { type: DataTypes.STRING(255) }
}, { sequelize, tableName: "stock_counts", underscored: true, paranoid: true });

export { StockCount };