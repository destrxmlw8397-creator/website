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
    customerName: { type: String, default: 'নগদ' },
    customerMobile: { type: String, default: 'N/A' },
    customerAddress: { type: String, default: 'N/A' },
    items: [{
        name: String,
        qty: Number,
        price: Number,
        category: String
    }],
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    discount: { type: Number, default: 0 },
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

// ==================== AUTHENTICATION ROUTES ====================

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

// পাসওয়ার্ড রিসেট API (ডিফল্টে রিসেট)
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

// পাসওয়ার্ড স্ট্যাটাস API
app.get('/api/password-status', async (req, res) => {
    try {
        const user = await User.findOne();
        res.json({ hasPassword: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PRODUCT ROUTES ====================

// সব পণ্য দেখুন (পাবলিক)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// একক পণ্য দেখুন
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নতুন পণ্য যোগ করুন (প্রোটেক্টেড)
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
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// পণ্য আপডেট করুন (প্রোটেক্টেড)
app.put('/api/products/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        await createLog(`🔄 পণ্য আপডেট করা হয়েছে: ${updatedProduct.name}`);
        res.json(updatedProduct);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// পণ্য ডিলিট করুন (প্রোটেক্টেড)
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
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ব্যাচ প্রোডাক্ট ইম্পোর্ট (প্রোটেক্টেড)
app.post('/api/products/import', async (req, res) => {
    try {
        const { password, products } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const result = await Product.insertMany(products);
        await createLog(`📦 ${result.length} টি পণ্য ইম্পোর্ট করা হয়েছে`);
        res.json({ success: true, count: result.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== SALE ROUTES ====================

// সব বিক্রি দেখুন
app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 });
        res.json(sales);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// আজকের বিক্রি
app.get('/api/sales/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const sales = await Sale.find({
            date: { $gte: today, $lt: tomorrow }
        }).sort({ date: -1 });
        
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নির্দিষ্ট বিক্রি দেখুন
app.get('/api/sales/:id', async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.id);
        if (!sale) {
            return res.status(404).json({ error: 'Sale not found' });
        }
        res.json(sale);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// চেকআউট (নতুন বিক্রি) - POS থেকে কল হবে
app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, totalAmount, paidAmount, discount, paymentMethod } = req.body;
        
        // ভ্যালিডেশন
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        
        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ error: 'Invalid total amount' });
        }
        
        let totalCost = 0;
        let items = [];
        let updatedProducts = [];

        // প্রতিটি পণ্যের স্টক চেক ও আপডেট
        for (let item of cart) {
            const p = await Product.findById(item._id);
            if (!p) {
                return res.status(404).json({ error: `Product ${item.name} not found` });
            }
            
            if (p.stock < item.qty) {
                return res.status(400).json({ error: `${p.name} এর জন্য পর্যাপ্ত স্টক নেই! (স্টক: ${p.stock})` });
            }
            
            totalCost += (p.costPrice || 0) * item.qty;
            
            // স্টক কমানো
            p.stock -= item.qty;
            await p.save();
            updatedProducts.push(p);
            
            items.push({
                name: p.name,
                qty: item.qty,
                price: p.price,
                category: p.category
            });
        }

        const profit = totalAmount - totalCost;
        const dueAmount = totalAmount - (paidAmount || 0);

        const newSale = new Sale({
            customerName: customerName || 'নগদ',
            customerMobile: customerMobile || 'N/A',
            customerAddress: customerAddress || 'N/A',
            items: items,
            totalAmount,
            paidAmount: paidAmount || 0,
            dueAmount: dueAmount,
            profit: profit,
            paymentMethod: paymentMethod || 'cash',
            discount: discount || 0,
            date: new Date()
        });
        
        await newSale.save();
        await createLog(`🛒 বিক্রি সম্পন্ন: কাস্টমার ${customerName || 'নগদ'}, মোট ${totalAmount}৳, বাকি ${dueAmount}৳`);
        
        res.json({ 
            success: true, 
            sale: newSale,
            message: 'Payment processed successfully' 
        });
        
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: err.message });
    }
});

// বাকি পরিশোধ
app.post('/api/sales/pay-due/:id', async (req, res) => {
    try {
        const { password, paidAmount } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const sale = await Sale.findById(req.params.id);
        if (!sale) {
            return res.status(404).json({ error: "Sale record not found" });
        }
        
        if (paidAmount > sale.dueAmount) {
            return res.status(400).json({ error: "Paid amount exceeds due amount" });
        }
        
        sale.paidAmount += Number(paidAmount);
        sale.dueAmount -= Number(paidAmount);
        await sale.save();
        
        await createLog(`💰 বাকি জমা: কাস্টমার ${sale.customerName}, পরিমাণ ${paidAmount}৳, বাকি ${sale.dueAmount}৳`);
        res.json({ 
            success: true, 
            sale,
            message: 'Due payment successful' 
        });
        
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// সেলস রেকর্ড আপডেট
app.put('/api/sales/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedSale = await Sale.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updatedSale);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== EXPENSE ROUTES ====================

// সব খরচ দেখুন
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ date: -1 });
        res.json(expenses);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// আজকের খরচ
app.get('/api/expenses/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const expenses = await Expense.find({
            date: { $gte: today, $lt: tomorrow }
        });
        
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নতুন খরচ যোগ করুন
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
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// খরচ আপডেট
app.put('/api/expenses/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updatedExpense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// খরচ ডিলিট
app.delete('/api/expenses/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const expense = await Expense.findById(req.params.id);
        if (expense) {
            await createLog(`❌ খরচ ডিলিট: ${expense.title}`);
            await Expense.findByIdAndDelete(req.params.id);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Expense not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== LOG ROUTES ====================

// সব লগ দেখুন
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(100);
        res.json(logs);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// লগ ক্লিয়ার করুন
app.delete('/api/logs', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        await Log.deleteMany({});
        await createLog('🧹 সব লগ মুছে ফেলা হয়েছে');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BACKUP ROUTES ====================

// সব ব্যাকআপ দেখুন
app.get('/api/backups', async (req, res) => {
    try {
        const backups = await Backup.find().sort({ date: -1 }).limit(20);
        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নতুন ব্যাকআপ তৈরি করুন
app.post('/api/backup', async (req, res) => {
    try {
        const { password } = req.body;
        
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
            name: `backup_${new Date().toISOString().slice(0,10)}`,
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

// ব্যাকআপ থেকে পুনরুদ্ধার করুন
app.post('/api/restore', async (req, res) => {
    try {
        const { password, backupId } = req.body;
        
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
        
        if (backup.data.products) await Product.insertMany(backup.data.products);
        if (backup.data.sales) await Sale.insertMany(backup.data.sales);
        if (backup.data.expenses) await Expense.insertMany(backup.data.expenses);
        if (backup.data.logs) await Log.insertMany(backup.data.logs);
        
        await createLog('📂 ব্যাকআপ থেকে ডাটা পুনরুদ্ধার করা হয়েছে');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ব্যাকআপ ডিলিট
app.delete('/api/backups/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        await Backup.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== STATS ROUTES ====================

// ড্যাশবোর্ড স্ট্যাটিস্টিক্স
app.get('/api/stats', async (req, res) => {
    try {
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        
        // বর্তমান সময়
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // আজকের বিক্রি
        const todaySales = sales.filter(s => new Date(s.date) >= today);
        const todayTotal = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        const todayProfit = todaySales.reduce((acc, s) => acc + (s.profit || 0), 0);
        
        // মাসের শুরু
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthSales = sales.filter(s => new Date(s.date) >= monthStart);
        const monthTotal = monthSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        const monthProfit = monthSales.reduce((acc, s) => acc + (s.profit || 0), 0);
        
        // সারাংশ
        let stockValue = products.reduce((acc, p) => acc + ((p.costPrice || 0) * (p.stock || 0)), 0);
        let totalSales = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        let grossProfit = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
        let totalDue = sales.reduce((acc, s) => acc + (s.dueAmount || 0), 0);
        let totalExpense = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
        let netProfit = grossProfit - totalExpense;

        // ক্যাটাগরি স্ট্যাটস
        let categoryStats = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                const cat = item.category || "General";
                categoryStats[cat] = (categoryStats[cat] || 0) + item.qty;
            });
        });

        // Expiry statistics
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
            todayTotal,
            todayProfit,
            monthTotal,
            monthProfit,
            categoryStats,
            totalProducts: products.length,
            totalStock: products.reduce((acc, p) => acc + p.stock, 0),
            expiredCount: expiredProducts.length,
            expiringCount: expiringSoonProducts.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== SEARCH ROUTES ====================

// পণ্য খুঁজুন (বারকোড বা নাম দিয়ে)
app.get('/api/search/products', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }
        
        const products = await Product.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { barcode: { $regex: q, $options: 'i' } },
                { category: { $regex: q, $options: 'i' } }
            ]
        }).limit(20);
        
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== HEALTH CHECK ====================

// সার্ভার হেলথ চেক
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        time: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ==================== STATIC FILES ====================

// SPA এর জন্য সব রুট ইনডেক্স ফাইলে পাঠানো
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🛒 POS: http://localhost:${PORT}/pos.html`);
});
