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

// ১. প্রোডাক্ট স্কিমা
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

// ২. সেলস স্কিমা
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

// ৩. নতুন যুক্ত: এক্সপেন্স (Expense) স্কিমা
const ExpenseSchema = new mongoose.Schema({
    title: String,
    amount: Number,
    date: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// ৪. নতুন যুক্ত: অ্যাক্টিভিটি লগ (Activity Log) স্কিমা
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

// পণ্যের তালিকা
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ date: -1 });
    res.json(products);
});

// বিক্রির রিপোর্ট
app.get('/api/sales', async (req, res) => {
    const sales = await Sale.find().sort({ date: -1 });
    res.json(sales);
});

// নতুন পণ্য যোগ
app.post('/api/products', async (req, res) => {
    const newProduct = new Product(req.body);
    await newProduct.save();
    await createLog(`পণ্য যোগ করা হয়েছে: ${newProduct.name}`);
    res.status(201).json(newProduct);
});

// পণ্য আপডেট
app.put('/api/products/:id', async (req, res) => {
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await createLog(`পণ্য আপডেট করা হয়েছে: ${updatedProduct.name}`);
    res.json(updatedProduct);
});

// পণ্য ডিলিট
app.delete('/api/products/:id', async (req, res) => {
    const p = await Product.findById(req.params.id);
    if(p) await createLog(`পণ্য ডিলিট করা হয়েছে: ${p.name}`);
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

// ৫. নতুন যুক্ত: এক্সপেন্স এপিআই
app.get('/api/expenses', async (req, res) => {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json(expenses);
});

app.post('/api/expenses', async (req, res) => {
    const newExpense = new Expense(req.body);
    await newExpense.save();
    await createLog(`খরচ এন্ট্রি: ${newExpense.title} - ${newExpense.amount}৳`);
    res.status(201).json(newExpense);
});

// ৬. নতুন যুক্ত: লগ এপিআই
app.get('/api/logs', async (req, res) => {
    const logs = await Log.find().sort({ date: -1 }).limit(50);
    res.json(logs);
});

// বাকি পরিশোধ
app.post('/api/sales/pay-due/:id', async (req, res) => {
    const { paidAmount } = req.body;
    const sale = await Sale.findById(req.params.id);
    if (sale) {
        sale.paidAmount += paidAmount;
        sale.dueAmount -= paidAmount;
        await sale.save();
        await createLog(`বাকি টাকা জমা নেওয়া হয়েছে: কাস্টমার ${sale.customerName}, পরিমাণ ${paidAmount}৳`);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Not found" });
    }
});

// চেকআউট (স্টক ম্যানেজমেন্ট ও প্রফিট ক্যালকুলেশন)
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
        await createLog(`নতুন বিক্রি সম্পন্ন: কাস্টমার ${customerName}, মোট ${totalAmount}৳`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৭. অ্যাডভান্সড ড্যাশবোর্ড স্ট্যাটস
app.get('/api/stats', async (req, res) => {
    try {
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        
        let stockValue = products.reduce((acc, p) => acc + (p.costPrice * p.stock), 0);
        let totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
        let grossProfit = sales.reduce((acc, s) => acc + s.profit, 0);
        let totalDue = sales.reduce((acc, s) => acc + s.dueAmount, 0);
        let totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);
        let netProfit = grossProfit - totalExpense;

        // ক্যাটাগরি অনুযায়ী বিক্রির ডাটা (Pie Chart-এর জন্য)
        let categoryStats = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                categoryStats[item.category] = (categoryStats[item.category] || 0) + item.qty;
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
