import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Employee extends Model {}
Employee.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  first_name: { type: DataTypes.STRING(100), allowNull: false },
  last_name:  { type: DataTypes.STRING(100), allowNull: false },
  email:      { type: DataTypes.STRING(150), allowNull: true, unique: false },
  phone:      { type: DataTypes.STRING(50),  allowNull: true },
  dni:        { type: DataTypes.STRING(20),  allowNull: true },
  cuil:       { type: DataTypes.STRING(20),  allowNull: true },
  role:       { type: DataTypes.STRING(50),  allowNull: true }, // mozo, cocina, barra, cajero, etc.
  pin_code:   { type: DataTypes.STRING(6),   allowNull: true }, // para kiosco (4–6 dígitos)
  hire_date:  { type: DataTypes.DATEONLY,    allowNull: true },
  termination_date: { type: DataTypes.DATEONLY, allowNull: true },
  is_active:  { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },

  // remuneración
  hourly_rate: { type: DataTypes.DECIMAL(12,2), allowNull: true, defaultValue: "0.00" }, // $/hora
  base_salary: { type: DataTypes.DECIMAL(12,2), allowNull: true, defaultValue: "0.00" }, // opcional
}, {
  sequelize,
  tableName: "employees",
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ["last_name", "first_name"] },
    { fields: ["is_active"] },
    { fields: ["pin_code"] },
  ]
});

export { Employee };
