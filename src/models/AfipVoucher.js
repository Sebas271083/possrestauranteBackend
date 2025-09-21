import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class AfipVoucher extends Model {}
AfipVoucher.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cuit: { type: DataTypes.STRING(11), allowNull: false },
  pto_vta: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cbte_tipo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // 1=A, 6=B, 11=C
  cbte_nro: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cae: { type: DataTypes.STRING(14), allowNull: false },
  cae_vto: { type: DataTypes.STRING(8), allowNull: false }, // YYYYMMDD
  resultado: { type: DataTypes.STRING(1), allowNull: false }, // A/R
  request_json: { type: DataTypes.JSON },
  response_json: { type: DataTypes.JSON }
}, { sequelize, tableName: "afip_vouchers", underscored: true, paranoid: true });

export { AfipVoucher };
