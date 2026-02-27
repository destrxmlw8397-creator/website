const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
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

// ইউজার স্কিমা (পাসওয়ার্ড ম্যানেজমেন্ট)
const UserSchema = new mongoose.Schema({
    password: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// প্রোডাক্ট স্কিমা (Expiry Date সহ)
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" }, 
    category: { type: String, default: "" }, 
    supplier: { type: String, default: "" }, 
    costPrice: { type: Number, default: 0 }, 
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    alertLimit: { type: Number, default: 5 },
    expiryDate: { type: Date, default: null },
    date: { type: Date, default: Date.now }
});

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

// এক্সপেন্স স্কিমা
const ExpenseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: "অন্যান্য" },
    date: { type: Date, default: Date.now }
});

// অ্যাক্টিভিটি লগ স্কিমা
const LogSchema = new mongoose.Schema({
    action: String,
    date: { type: Date, default: Date.now }
});

// ব্যাকআপ স্কিমা
const BackupSchema = new mongoose.Schema({
    name: String,
    data: Object,
    size: Number,
    date: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', ProductSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Log = mongoose.model('Log', LogSchema);
const Backup = mongoose.model('Backup', BackupSchema);

// --- ইনিশিয়ালাইজেশন: প্রথম ইউজার তৈরি (যদি না থাকে) ---
async function initializeUser() {
    try {
        const userExists = await User.findOne();
        if (!userExists) {
            const hashedPassword = await bcrypt.hash('1234', 10);
            const user = new User({ password: hashedPassword });
            await user.save();
            console.log('✅ Default user created with password: 1234');
        }
    } catch (error) {
        console.error('Error creating default user:', error);
    }
}
initializeUser();

// --- সাহায্যকারী ফাংশন: লগ সেভ করা ---
async function createLog(msg) {
    try {
        const newLog = new Log({ action: msg });
        await newLog.save();
        // লগ ১০০ এর বেশি রাখার দরকার নেই
        const logCount = await Log.countDocuments();
        if (logCount > 100) {
            const oldestLog = await Log.findOne().sort({ date: 1 });
            if (oldestLog) await Log.deleteOne({ _id: oldestLog._id });
        }
    } catch (e) { console.log("Log Error:", e); }
}

// --- পাসওয়ার্ড অথেনটিকেশন মিডলওয়্যার ---
async function verifyPassword(inputPassword) {
    try {
        const user = await User.findOne();
        if (!user) return false;
        return await bcrypt.compare(inputPassword, user.password);
    } catch (error) {
        console.error('Password verification error:', error);
        return false;
    }
}

// পাসওয়ার্ড চেক API
app.post('/api/verify-password', async (req, res) => {
    try {
        const { password } = req.body;
        const isValid = await verifyPassword(password);
        res.json({ valid: isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// পাসওয়ার্ড আপডেট API
app.post('/api/update-password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        
        // পুরনো পাসওয়ার্ড চেক
        const isValid = await verifyPassword(oldPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        // নতুন পাসওয়ার্ড হ্যাশ করে সেভ
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const user = await User.findOne();
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔐 পাসওয়ার্ড পরিবর্তন করা হয়েছে');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// পাসওয়ার্ড রিমুভ API (ডিফল্টে রিসেট)
app.post('/api/reset-password', async (req, res) => {
    try {
        const { currentPassword } = req.body;
        
        // পুরনো পাসওয়ার্ড চেক
        const isValid = await verifyPassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        // ডিফল্ট পাসওয়ার্ডে রিসেট
        const hashedPassword = await bcrypt.hash('1234', 10);
        const user = await User.findOne();
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔄 পাসওয়ার্ড ডিফল্টে রিসেট করা হয়েছে');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// পাসওয়ার্ড স্ট্যাটাস API (পাসওয়ার্ড সেট করা আছে কিনা)
app.get('/api/password-status', async (req, res) => {
    try {
        const user = await User.findOne();
        // সবসময় true রিটার্ন করবে কারণ ডিফল্ট ইউজার আছে
        res.json({ hasPassword: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API ROUTES (সব প্রোটেক্টেড অ্যাকশনের আগে পাসওয়ার্ড ভেরিফিকেশন) ---

// পণ্যের তালিকা দেখা (পাবলিক - পাসওয়ার্ড লাগবে না)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// নতুন পণ্য যোগ করা (প্রোটেক্টেড)
app.post('/api/products', async (req, res) => {
    try {
        const { password, ...productData } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newProduct = new Product(productData);
        await newProduct.save();
        await createLog(`✅ নতুন পণ্য যোগ করা হয়েছে: ${newProduct.name}`);
        res.status(201).json(newProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পণ্য আপডেট করা (প্রোটেক্টেড)
app.put('/api/products/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        await createLog(`🔄 পণ্য আপডেট করা হয়েছে: ${updatedProduct.name}`);
        res.json(updatedProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পণ্য ডিলিট করা (প্রোটেক্টেড)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const p = await Product.findById(req.params.id);
        if(p) {
            await createLog(`❌ পণ্য ডিলিট করা হয়েছে: ${p.name}`);
            await Product.findByIdAndDelete(req.params.id);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Product not found" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// বিক্রির রিপোর্ট দেখা (পাবলিক)
app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 });
        res.json(sales);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// খরচ এপিআই (GET - পাবলিক)
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ date: -1 });
        res.json(expenses);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// খরচ যোগ করা (POST - প্রোটেক্টেড)
app.post('/api/expenses', async (req, res) => {
    try {
        const { password, ...expenseData } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newExpense = new Expense(expenseData);
        await newExpense.save();
        await createLog(`💰 খরচ এন্ট্রি: ${newExpense.title} - ${newExpense.amount}৳`);
        res.status(201).json(newExpense);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// লগ এপিআই (পাবলিক)
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(50);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// বাকি পরিশোধ (Pay Due - প্রোটেক্টেড)
app.post('/api/sales/pay-due/:id', async (req, res) => {
    try {
        const { password, paidAmount } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const sale = await Sale.findById(req.params.id);
        if (sale) {
            sale.paidAmount += Number(paidAmount);
            sale.dueAmount -= Number(paidAmount);
            await sale.save();
            await createLog(`💰 বাকি জমা: কাস্টমার ${sale.customerName}, পরিমাণ ${paidAmount}৳`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Sale record not found" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// চেকআউট (স্টক ও প্রফিট ম্যানেজমেন্ট - প্রোটেক্টেড)
app.post('/api/checkout', async (req, res) => {
    try {
        const { password, cart, customerName, customerMobile, paidAmount, totalAmount } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
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
        await createLog(`🛒 বিক্রি সম্পন্ন: কাস্টমার ${customerName}, মোট ${totalAmount}৳`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ব্যাকআপ তৈরি (প্রোটেক্টেড)
app.post('/api/backup', async (req, res) => {
    try {
        const { password } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        const logs = await Log.find();
        
        const backupData = {
            products,
            sales,
            expenses,
            logs,
            version: '2.0',
            date: new Date()
        };
        
        const backup = new Backup({
            name: `backup_${new Date().toISOString()}`,
            data: backupData,
            size: JSON.stringify(backupData).length
        });
        
        await backup.save();
        await createLog('💾 ব্যাকআপ তৈরি করা হয়েছে');
        res.json({ success: true, backup });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ব্যাকআপ পুনরুদ্ধার (প্রোটেক্টেড)
app.post('/api/restore', async (req, res) => {
    try {
        const { password, backupId } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const backup = await Backup.findById(backupId);
        
        if (!backup) {
            return res.status(404).json({ error: 'Backup not found' });
        }
        
        // ডাটা পুনরুদ্ধার
        await Product.deleteMany({});
        await Sale.deleteMany({});
        await Expense.deleteMany({});
        await Log.deleteMany({});
        
        await Product.insertMany(backup.data.products);
        await Sale.insertMany(backup.data.sales);
        await Expense.insertMany(backup.data.expenses);
        await Log.insertMany(backup.data.logs);
        
        await createLog('📂 ব্যাকআপ থেকে ডাটা পুনরুদ্ধার করা হয়েছে');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ব্যাকআপ লিস্ট (পাবলিক)
app.get('/api/backups', async (req, res) => {
    try {
        const backups = await Backup.find().sort({ date: -1 }).limit(20);
        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// অ্যাডভান্সড ড্যাশবোর্ড স্ট্যাটস (পাবলিক)
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

        // Expiry statistics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const expiredProducts = products.filter(p => p.expiryDate && new Date(p.expiryDate) < today);
        const expiringSoonProducts = products.filter(p => {
            if (!p.expiryDate) return false;
            const expiry = new Date(p.expiryDate);
            const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
            return diffDays > 0 && diffDays <= 7;
        });

        res.json({ 
            stockValue, 
            totalSales, 
            grossProfit, 
            totalDue, 
            totalExpense, 
            netProfit, 
            categoryStats,
            expiredCount: expiredProducts.length,
            expiringCount: expiringSoonProducts.length
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
