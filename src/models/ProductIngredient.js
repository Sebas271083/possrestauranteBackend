import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class ProductIngredient extends Model {}
ProductIngredient.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  ingredient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  qty_per_unit: { type: DataTypes.DECIMAL(12,3), allowNull: false }, // cuánto insumo por 1 unidad del producto
  waste_factor: { type: DataTypes.DECIMAL(5,4), allowNull: false, defaultValue: "0.0000" } // merma (0..1)
}, {
   sequelize,
   tableName: "product_ingredients",
   timestamps: false,
   underscored: true,
   indexes: [{ unique: true, fields: ["product_id","ingredient_id"] }]
});
export { ProductIngredient };
