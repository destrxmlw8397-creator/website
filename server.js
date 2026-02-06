const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB কানেকশন
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// --- ১. স্কিমা ডেফিনিশন ---

// প্রোডাক্ট স্কিমা
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, 
    category: { type: String, default: "" }, 
    supplier: { type: String, default: "" }, 
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

// এক্সপেন্স স্কিমা
const ExpenseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// অ্যাক্টিভিটি লগ স্কিমা
const LogSchema = new mongoose.Schema({
    action: String,
    date: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

// --- সাহায্যকারী ফাংশন: লগ সেভ করা ---
async function createLog(msg) {
    try {
        const newLog = new Log({ action: msg });
        await newLog.save();
    } catch (e) { console.log("Log Error:", e); }
}

// --- API ROUTES ---

// পণ্যের তালিকা দেখা
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// নতুন পণ্য যোগ করা
app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        await createLog(`পণ্য যোগ করা হয়েছে: ${newProduct.name}`);
        res.status(201).json(newProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পণ্য আপডেট করা
app.put('/api/products/:id', async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await createLog(`পণ্য আপডেট করা হয়েছে: ${updatedProduct.name}`);
        res.json(updatedProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পণ্য ডিলিট করা
app.delete('/api/products/:id', async (req, res) => {
    try {
        const p = await Product.findById(req.params.id);
        if(p) {
            await createLog(`পণ্য ডিলিট করা হয়েছে: ${p.name}`);
            await Product.findByIdAndDelete(req.params.id);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Product not found" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// বিক্রির রিপোর্ট দেখা
app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 });
        res.json(sales);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// খরচ এপিআই (GET & POST)
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ date: -1 });
        res.json(expenses);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const newExpense = new Expense(req.body);
        await newExpense.save();
        await createLog(`খরচ এন্ট্রি: ${newExpense.title} - ${newExpense.amount}৳`);
        res.status(201).json(newExpense);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// লগ এপিআই
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(50);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// বাকি পরিশোধ (Pay Due)
app.post('/api/sales/pay-due/:id', async (req, res) => {
    try {
        const { paidAmount } = req.body;
        const sale = await Sale.findById(req.params.id);
        if (sale) {
            sale.paidAmount += Number(paidAmount);
            sale.dueAmount -= Number(paidAmount);
            await sale.save();
            await createLog(`বাকি জমা: কাস্টমার ${sale.customerName}, পরিমাণ ${paidAmount}৳`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Sale record not found" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// চেকআউট (স্টক ও প্রফিট ম্যানেজমেন্ট)
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
        await createLog(`বিক্রি সম্পন্ন: কাস্টমার ${customerName}, মোট ${totalAmount}৳`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// অ্যাডভান্সড ড্যাশবোর্ড স্ট্যাটস (Dashboard Summary)
app.get('/api/stats', async (req, res) => {
    try {
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        
        let stockValue = products.reduce((acc, p) => acc + ((p.costPrice || 0) * (p.stock || 0)), 0);
        let totalSales = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        let grossProfit = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
        let totalDue = sales.reduce((acc, s) => acc + (s.dueAmount || 0), 0);
        let totalExpense = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
        let netProfit = grossProfit - totalExpense;

        let categoryStats = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                const cat = item.category || "General";
                categoryStats[cat] = (categoryStats[cat] || 0) + item.qty;
            });
        });

        res.json({ 
            stockValue, totalSales, grossProfit, 
            totalDue, totalExpense, netProfit, categoryStats 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA এর জন্য সব রুট ইনডেক্স ফাইলে পাঠানো
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// সার্ভার স্টার্ট
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
