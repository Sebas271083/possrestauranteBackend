// src/models/Product.js
import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class Product extends Model {}
Product.init({
  id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name:       { type: DataTypes.STRING(150), allowNull: false },
  sku:        { type: DataTypes.STRING(64), allowNull: true, unique: true },
  // opcional: enum
  // station: { type: DataTypes.ENUM("kitchen","bar","pastry"), allowNull: true },
  station:    { type: DataTypes.STRING(50), allowNull: true },
  price:      { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
  tax_rate:   { type: DataTypes.DECIMAL(5,2), allowNull: false, defaultValue: "0.00" },
  image_url:  { type: DataTypes.STRING(500), allowNull: true },
  is_active:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  stock_deduct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sort_order:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 } // 👈 NUEVO
}, { sequelize, tableName: "products", paranoid: true, underscored: true });

