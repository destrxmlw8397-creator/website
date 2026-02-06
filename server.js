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

// প্রোডাক্ট স্কিমা (category ও supplier স্পষ্টভাবে যোগ করা হয়েছে)
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, 
    category: { type: String, default: "" }, // নতুন যুক্ত
    supplier: { type: String, default: "" }, // নতুন যুক্ত
    costPrice: { type: Number, default: 0 }, 
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    date: { type: Date, default: Date.now }
}, { strict: false }); 

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

// ১. সব পণ্য দেখা (সার্চ ও ফিল্টার সাপোর্টসহ)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ২. বিক্রির রিপোর্ট দেখা (গ্রাফের জন্য লিমিট বা ফিল্টার লজিক)
app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 });
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৩. নতুন পণ্য যোগ করা
app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ৪. পণ্য এডিট করা
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

// ৫. বাকি টাকা জমা দেওয়া
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
                // স্টক কমানো
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

// ৮. ড্যাশবোর্ড স্ট্যাটস এপিআই (ঐচ্ছিক কিন্তু গ্রাফের জন্য কার্যকর)
app.get('/api/stats', async (req, res) => {
    try {
        const products = await Product.find();
        const sales = await Sale.find();
        
        let stockValue = products.reduce((acc, p) => acc + (p.costPrice * p.stock), 0);
        let totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
        let totalProfit = sales.reduce((acc, s) => acc + s.profit, 0);
        let totalDue = sales.reduce((acc, s) => acc + s.dueAmount, 0);

        res.json({ stockValue, totalSales, totalProfit, totalDue });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
