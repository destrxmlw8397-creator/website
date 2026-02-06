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

// --- ১. মডেলসমূহ (Models) ---

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, 
    category: { type: String, default: "" }, 
    supplier: { type: String, default: "" }, 
    costPrice: { type: Number, default: 0 }, 
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    soldQty: { type: Number, default: 0 }, // নতুন: বেশি বিক্রিত পণ্য ট্র্যাকিংয়ের জন্য
    date: { type: Date, default: Date.now }
}, { strict: false }); 

const Product = mongoose.model('Product', ProductSchema);

const SaleSchema = new mongoose.Schema({
    customerName: String,
    customerMobile: String,
    items: Array,
    totalAmount: Number,
    paidAmount: Number,
    dueAmount: Number,
    discount: { type: Number, default: 0 }, // ৪ নম্বর ফিচারের জন্য
    profit: Number,
    date: { type: Date, default: Date.now }
});
const Sale = mongoose.model('Sale', SaleSchema);

const ExpenseSchema = new mongoose.Schema({
    title: String,
    amount: Number,
    date: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// ৩ নম্বর ফিচার: সাপ্লায়ার বকেয়া (Supplier Payable)
const SupplierPayableSchema = new mongoose.Schema({
    supplierName: String,
    totalOwed: { type: Number, default: 0 },
    lastPaymentDate: Date
});
const SupplierPayable = mongoose.model('SupplierPayable', SupplierPayableSchema);

const LogSchema = new mongoose.Schema({
    action: String,
    user: { type: String, default: "Admin" }, // ৫ নম্বর ফিচারের জন্য
    date: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

// --- সাহায্যকারী ফাংশন ---
async function createLog(msg, user = "Admin") {
    try {
        const newLog = new Log({ action: msg, user });
        await newLog.save();
    } catch (e) { console.log("Log Error:", e); }
}

// --- ২. এপিআই রুটসমূহ (API Routes) ---

// পণ্য ইনভেন্টরি
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ date: -1 });
    res.json(products);
});

app.post('/api/products', async (req, res) => {
    const newProduct = new Product(req.body);
    await newProduct.save();
    await createLog(`পণ্য যোগ: ${newProduct.name}`);
    res.status(201).json(newProduct);
});

app.put('/api/products/:id', async (req, res) => {
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await createLog(`পণ্য এডিট: ${updatedProduct.name}`);
    res.json(updatedProduct);
});

app.delete('/api/products/:id', async (req, res) => {
    const p = await Product.findById(req.params.id);
    if(p) await createLog(`পণ্য ডিলিট: ${p.name}`);
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

// ৩ নম্বর ফিচার: সাপ্লায়ার এপিআই
app.get('/api/suppliers', async (req, res) => {
    const payables = await SupplierPayable.find();
    res.json(payables);
});

// ২ নম্বর ফিচার: কাস্টমার লেজার (নির্দিষ্ট কাস্টমারের ইতিহাস)
app.get('/api/customer/:mobile', async (req, res) => {
    const history = await Sale.find({ customerMobile: req.params.mobile }).sort({ date: -1 });
    res.json(history);
});

// ৪ নম্বর ফিচার ও ৬ নম্বর ইনসাইট: চেকআউট আপডেট
app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, paidAmount, totalAmount, discount } = req.body;
        let totalCost = 0;

        for (let item of cart) {
            const p = await Product.findById(item._id);
            if (p) {
                totalCost += (p.costPrice || 0) * item.qty;
                // ১ নম্বর ইনসাইটের জন্য soldQty আপডেট
                await Product.findByIdAndUpdate(item._id, { 
                    $inc: { stock: -item.qty, soldQty: item.qty } 
                });
            }
        }

        // ডিসকাউন্ট বাদে প্রফিট ক্যালকুলেশন
        const finalProfit = (totalAmount - totalCost) - (discount || 0);
        const dueAmount = totalAmount - paidAmount;

        const newSale = new Sale({
            customerName, customerMobile, items: cart,
            totalAmount, paidAmount, dueAmount, profit: finalProfit, discount
        });
        await newSale.save();
        await createLog(`বিক্রি সম্পন্ন: ${customerName}, পরিমাণ ${totalAmount}৳`);
        res.json({ success: true, saleId: newSale._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// খরচ এপিআই
app.post('/api/expenses', async (req, res) => {
    const newExpense = new Expense(req.body);
    await newExpense.save();
    await createLog(`খরচ এন্ট্রি: ${newExpense.title}`);
    res.status(201).json(newExpense);
});

app.get('/api/expenses', async (req, res) => {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json(expenses);
});

// ড্যাশবোর্ড স্ট্যাটস (সবগুলো ফিচার একীভূত)
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

        // ১ নম্বর ফিচার: স্টক প্রিডিকশন ইনসাইট
        const topSoldProducts = await Product.find().sort({ soldQty: -1 }).limit(5);
        const lowStockProducts = products.filter(p => p.stock < 10);

        // ৬ নম্বর ফিচার: মাসিক বিক্রির গ্রাফ ডাটা (গত ১২ মাস)
        const monthlySales = await Sale.aggregate([
            {
                $group: {
                    _id: { month: { $month: "$date" }, year: { $year: "$date" } },
                    total: { $sum: "$totalAmount" },
                    profit: { $sum: "$profit" }
                }
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 12 }
        ]);

        res.json({ 
            stockValue, totalSales, grossProfit, 
            totalDue, totalExpense, netProfit, 
            topSoldProducts, lowStockProducts, monthlySales
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs', async (req, res) => {
    const logs = await Log.find().sort({ date: -1 }).limit(100);
    res.json(logs);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
