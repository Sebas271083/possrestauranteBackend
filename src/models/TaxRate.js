import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class TaxRate extends Model {}
TaxRate.init({
  name: { type: DataTypes.STRING(50), allowNull: false },
  rate_pct: { type: DataTypes.DECIMAL(6,3), allowNull: false, defaultValue: 0 }, // ej 21.000
  inclusive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { sequelize, modelName: "tax_rate", underscored: true, paranoid: true });
