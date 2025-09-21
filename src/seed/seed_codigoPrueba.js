// src/scripts/seed_demo.js
import "dotenv/config.js";
import { sequelize } from "../config/db.js";
import {
    Area, Table,
    Category, Product,
    ModifierGroup, ModifierOption,
    ProductCategory, ProductModifierGroup,
    User,
} from "../models/index.js";

async function seed() {
    console.log("➡️  Iniciando seed de DEMO…");
    await sequelize.authenticate();


    await Category.create({ name: "Pizzas", sort_order: 1 });
    await Product.create({
        name: "Muzzarella", price: 5500, station: "kitchen",
        image_url: "/uploads/pizza-muzza.jpg", is_active: true, sort_order: 1
    });
    await Product.create({
        name: "Coca 500ml", price: 1800, station: "bar",
        image_url: "/uploads/coca-500.jpg", is_active: true, sort_order: 2
    });
}

seed();