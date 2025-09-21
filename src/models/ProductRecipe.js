import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";
import { Product } from "./Product.js";
import { Supply } from "./Supply.js";
import { Unit } from "./Unit.js";

export class ProductRecipe extends Model {}
ProductRecipe.init({
  product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  supply_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  qty:        { type: DataTypes.DECIMAL(12,4), allowNull: false },
  unit_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // opcional (si distinto a Supply.unit_id)
  waste_pct:  { type: DataTypes.DECIMAL(5,2), allowNull: false, defaultValue: 0 } // 0..100
}, { sequelize, modelName: "product_recipe", underscored: true, paranoid: true });

ProductRecipe.belongsTo(Product, { foreignKey: "product_id" });
ProductRecipe.belongsTo(Supply,  { foreignKey: "supply_id" });
ProductRecipe.belongsTo(Unit,    { foreignKey: "unit_id" });
