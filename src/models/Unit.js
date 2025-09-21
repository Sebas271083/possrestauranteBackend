import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class Unit extends Model {}
Unit.init({
  code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(50), allowNull: false }
}, { sequelize, modelName: "unit", underscored: true, paranoid: true });
