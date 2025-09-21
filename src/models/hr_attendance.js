// type: module
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class HrAttendance extends Model {
    static associate(models) {
      HrAttendance.belongsTo(models.Employee, {
        foreignKey: "employee_id",
        as: "employee",
        onDelete: "CASCADE",
      });
    }
  }

  HrAttendance.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: { type: DataTypes.INTEGER, allowNull: false },
      type: { type: DataTypes.ENUM("in", "out"), allowNull: false },
      at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      station: { type: DataTypes.STRING },
      meta: { type: DataTypes.JSONB, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "HrAttendance",
      tableName: "hr_attendance",
      underscored: true,
      timestamps: false,
    }
  );

  return HrAttendance;
};
