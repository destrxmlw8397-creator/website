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
    .then(() => console.log("✅ MongoDB Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// ১. প্রোডাক্ট স্কিমা (কেনা দাম ও বারকোড যুক্ত)
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, // বারকোড
    costPrice: { type: Number, default: 0 }, // কেনা দাম
    price: { type: Number, required: true }, // বিক্রয় মূল্য
    stock: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// ২. সেলস স্কিমা (বাকির হিসাব যুক্ত)
const SaleSchema = new mongoose.Schema({
    customerName: String,
    customerMobile: String,
    items: Array,
    totalAmount: Number,
    paidAmount: Number, // কত টাকা দিয়েছে
    dueAmount: Number,  // কত বাকি
    profit: Number,     // কত লাভ হলো
    date: { type: Date, default: Date.now }
});
const Sale = mongoose.model('Sale', SaleSchema);

// API: সব পণ্য দেখা
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ date: -1 });
    res.json(products);
});

// API: বিক্রির রিপোর্ট
app.get('/api/sales', async (req, res) => {
    const sales = await Sale.find().sort({ date: -1 });
    res.json(sales);
});

// API: নতুন পণ্য যোগ
app.post('/api/products', async (req, res) => {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.status(201).json(newProduct);
});

// API: অ্যাডভান্সড চেকআউট (লাভ ও বাকি ক্যালকুলেশন)
app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, paidAmount } = req.body;
        let totalAmount = 0;
        let totalCost = 0;

        for (let item of cart) {
            const p = await Product.findById(item._id);
            totalAmount += p.price * item.qty;
            totalCost += (p.costPrice || 0) * item.qty;
            // স্টক কমানো
            await Product.findByIdAndUpdate(item._id, { $inc: { stock: -item.qty } });
        }

        const profit = totalAmount - totalCost;
        const dueAmount = totalAmount - paidAmount;

        const newSale = new Sale({
            customerName,
            customerMobile,
            items: cart,
            totalAmount,
            paidAmount,
            dueAmount,
            profit
        });
        await newSale.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Advanced Server on port ${PORT}`));
