const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// প্রোডাক্ট স্কিমা
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, 
    costPrice: { type: Number, default: 0 }, 
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// সেলস স্কিমা
const SaleSchema = new mongoose.Schema({
    customerName: String,
    customerMobile: String,
    items: Array,
    totalAmount: Number,
    paidAmount: Number,
    dueAmount: Number,
    profit: Number,
    date: { type: Date, default: Date.now }
});
const Sale = mongoose.model('Sale', SaleSchema);

// --- API ROUTES ---

// ১. সব পণ্য দেখা
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ date: -1 });
    res.json(products);
});

// ২. বিক্রির রিপোর্ট দেখা
app.get('/api/sales', async (req, res) => {
    const sales = await Sale.find().sort({ date: -1 });
    res.json(sales);
});

// ৩. নতুন পণ্য যোগ করা
app.post('/api/products', async (req, res) => {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.status(201).json(newProduct);
});

// ৪. পণ্য এডিট করা (ফ্রন্টেন্ডের editProduct ফাংশনের জন্য)
app.put('/api/products/:id', async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json(updatedProduct);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৫. বাকি টাকা জমা দেওয়া (ফ্রন্টেন্ডের payDue ফাংশনের জন্য)
app.post('/api/sales/pay-due/:id', async (req, res) => {
    try {
        const { paidAmount } = req.body;
        const sale = await Sale.findById(req.params.id);
        
        if (sale) {
            sale.paidAmount += paidAmount;
            sale.dueAmount -= paidAmount;
            await sale.save();
            res.json({ success: true, message: "Due payment updated" });
        } else {
            res.status(404).json({ error: "Sale record not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৬. চেকআউট (স্টক ও লাভ হিসাব)
app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, paidAmount, totalAmount } = req.body;
        let totalCost = 0;

        for (let item of cart) {
            const p = await Product.findById(item._id);
            if (p) {
                totalCost += (p.costPrice || 0) * item.qty;
                await Product.findByIdAndUpdate(item._id, { $inc: { stock: -item.qty } });
            }
        }

        const profit = totalAmount - totalCost;
        const dueAmount = totalAmount - paidAmount;

        const newSale = new Sale({
            customerName, customerMobile, items: cart,
            totalAmount, paidAmount, dueAmount, profit
        });
        await newSale.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৭. পণ্য ডিলিট করা
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
