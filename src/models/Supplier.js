import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Supplier extends Model {}
Supplier.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  tax_id: { type: DataTypes.STRING(32) },         // CUIT u otro
  email: { type: DataTypes.STRING(120) },
  phone: { type: DataTypes.STRING(40) },
  address: { type: DataTypes.STRING(200) },
  notes: { type: DataTypes.STRING(255) },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { sequelize, tableName: "suppliers", underscored: true, paranoid: true });

export { Supplier };
