// src/models/index.js
import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

// Core
import { User } from "./User.js";
import { RefreshToken } from "./RefreshToken.js";


// Salón
import { Area } from "./Area.js";
import { Table } from "./Table.js";
import { Order } from "./Order.js";
import { OrderItem } from "./OrderItem.js";
import { TransferLog } from "./TransferLog.js";

// Catálogo
import { Category } from "./Category.js";
import { Product } from "./Product.js";
import { ModifierGroup } from "./ModifierGroup.js";
import {ModifierOption} from "./ModifierOption.js"


import { CashSession } from "./CashSession.js";
import { Payment } from "./Payment.js";

//Inventario & Recetas (BOM)
import { Ingredient } from "./Ingredient.js";
import { ProductIngredient } from "./ProductIngredient.js";
import { StockMovement } from "./StockMovement.js";

// Impresión
import { Printer } from "./Printer.js";
import { PrintJob } from "./PrintJob.js";

import { AfipVoucher } from "./AfipVoucher.js";

import { AuditLog } from "./AuditLog.js";

import { Supplier } from "./Supplier.js";
import { PurchaseOrder } from "./PurchaseOrder.js";
import { PurchaseOrderItem } from "./PurchaseOrderItem.js";

import { StockCount } from "./StockCount.js";
import { StockCountItem } from "./StockCountItem.js";

import { Employee } from "./Employee.js";
import { WorkSession } from "./WorkSession.js";
/* ========== Relaciones ========== */

// Auth
RefreshToken.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(RefreshToken, { foreignKey: "user_id" });

// Salón
Area.hasMany(Table, { foreignKey: "area_id" });
Table.belongsTo(Area, { foreignKey: "area_id" });

Table.hasMany(Order, { foreignKey: "table_id" });
Order.belongsTo(Table, { foreignKey: "table_id" });

Order.belongsTo(User, { as: "waiter", foreignKey: "waiter_id" });
User.hasMany(Order, { as: "waiterOrders", foreignKey: "waiter_id" });

Order.hasMany(OrderItem, { foreignKey: "order_id" });
OrderItem.belongsTo(Order, { foreignKey: "order_id" });

Payment.belongsTo(CashSession, { foreignKey: "session_id" });
CashSession.hasMany(Payment, { foreignKey: "session_id" });

// Catálogo
// Category <-> Product (N:M)
const ProductCategory = sequelize.define(
  "product_categories",
  {
    product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
  },
  { underscored: true, timestamps: false }
);

Product.belongsToMany(Category, { through: ProductCategory, foreignKey: "product_id" });
Category.belongsToMany(Product, { through: ProductCategory, foreignKey: "category_id" });

// Product <-> ModifierGroup (N:M)
const ProductModifierGroup = sequelize.define(
  "product_modifier_groups",
  {
    product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    group_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
  },
  { underscored: true, timestamps: false }
);

Product.belongsToMany(ModifierGroup, { through: ProductModifierGroup, foreignKey: "product_id" });
ModifierGroup.belongsToMany(Product, { through: ProductModifierGroup, foreignKey: "group_id" });

// ModifierGroup -> ModifierOption (1:N)
ModifierOption.belongsTo(ModifierGroup, { foreignKey: "group_id" });
ModifierGroup.hasMany(ModifierOption, { foreignKey: "group_id" });

Order.hasMany(Payment, { foreignKey: "order_id" });
Payment.belongsTo(Order, { foreignKey: "order_id" });

CashSession.hasMany(Payment, { foreignKey: "session_id" });
Payment.belongsTo(CashSession, { foreignKey: "session_id" });

// Product  N:M  Ingredient  (vía ProductIngredient)
Product.belongsToMany(Ingredient, { through: ProductIngredient, foreignKey: "product_id" });
Ingredient.belongsToMany(Product, { through: ProductIngredient, foreignKey: "ingredient_id" });

ProductIngredient.belongsTo(Product, { foreignKey: "product_id" });
ProductIngredient.belongsTo(Ingredient, { foreignKey: "ingredient_id" });
Product.hasMany(ProductIngredient, { foreignKey: "product_id" });
Ingredient.hasMany(ProductIngredient, { foreignKey: "ingredient_id" });

StockMovement.belongsTo(Ingredient, { foreignKey: "ingredient_id" });
Ingredient.hasMany(StockMovement, { foreignKey: "ingredient_id" });

PrintJob.belongsTo(Printer, { foreignKey: "printer_id" });
Printer.hasMany(PrintJob, { foreignKey: "printer_id" });


Supplier.hasMany(PurchaseOrder, { foreignKey: "supplier_id" });
PurchaseOrder.belongsTo(Supplier, { foreignKey: "supplier_id" });

PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: "purchase_order_id" });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: "purchase_order_id" });

// Item ↔ Ingredient
PurchaseOrderItem.belongsTo(Ingredient, { foreignKey: "ingredient_id" });
Ingredient.hasMany(PurchaseOrderItem, { foreignKey: "ingredient_id" });

StockCount.hasMany(StockCountItem, { foreignKey: "stock_count_id" });
StockCountItem.belongsTo(StockCount, { foreignKey: "stock_count_id" });

StockCountItem.belongsTo(Ingredient, { foreignKey: "ingredient_id" });
Ingredient.hasMany(StockCountItem, { foreignKey: "ingredient_id" });

Employee.hasMany(WorkSession, { foreignKey: "employee_id" });
WorkSession.belongsTo(Employee, { foreignKey: "employee_id" });
/* ========== Export único ========== */
export {
  // Core
  User, RefreshToken,
  // Salón
  Area, Table, Order, OrderItem, TransferLog,
  // Catálogo
  Category, Product, ModifierGroup, ModifierOption,
  // Throughs
  ProductCategory, ProductModifierGroup,
  //caja
  CashSession, Payment,

  //inventario & recetas
  Ingredient, ProductIngredient, StockMovement,

  // Impresión
  Printer, PrintJob,

  AuditLog,
  AfipVoucher,

  Supplier, PurchaseOrder, PurchaseOrderItem,
  StockCount, StockCountItem,

  Employee,
  WorkSession,
};
