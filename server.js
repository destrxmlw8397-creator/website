const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ১. স্ট্যাটিক ফাইল সার্ভ করা (যাতে index.html দেখা যায়)
// আপনার index.html ফাইলটি 'public' নামক ফোল্ডারে রাখতে হবে
app.use(express.static(path.join(__dirname, 'public')));

// ২. MongoDB Atlas কানেকশন
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// ৩. ডাটাবেস স্কিমা ও মডেল
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', ProductSchema);

// ৪. API Routes
// সব প্রোডাক্ট পাওয়ার জন্য
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: "সার্ভার এরর" });
    }
});

// নতুন প্রোডাক্ট যোগ করার জন্য
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, stock } = req.body;
        const newProduct = new Product({ name, price, stock });
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ message: "ডাটা সেভ করা যায়নি" });
    }
});

// প্রোডাক্ট ডিলিট করার জন্য
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: "সফলভাবে ডিলিট হয়েছে" });
    } catch (err) {
        res.status(500).json({ message: "ডিলিট করা যায়নি" });
    }
});

// ৫. ফ্রন্টএন্ড হ্যান্ডলিং (যেকোনো রুটেই index.html ফাইলটি পাঠাবে)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ৬. পোর্ট সেটআপ
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
