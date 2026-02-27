const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB কানেকশন
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// ==================== স্কিমা ডেফিনিশন ====================

// ইউজার স্কিমা (পাসওয়ার্ড ম্যানেজমেন্ট)
const UserSchema = new mongoose.Schema({
    password: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});

// প্রোডাক্ট স্কিমা
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
        _id: String,
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

// হোল্ড কার্ট স্কিমা (নতুন)
const HoldCartSchema = new mongoose.Schema({
    cart: [{
        _id: String,
        name: String,
        price: Number,
        qty: Number,
        category: String,
        barcode: String,
        stock: Number,
        costPrice: Number
    }],
    customerName: { type: String, default: 'নাম নেই' },
    customerMobile: { type: String, default: 'N/A' },
    customerAddress: { type: String, default: 'N/A' },
    discount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    totalAmount: { type: Number, default: 0 },
    itemsCount: { type: Number, default: 0 },
    holdDate: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(+new Date() + 24*60*60*1000) } // 24 ঘন্টা
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

// মডেল তৈরি
const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const HoldCart = mongoose.model('HoldCart', HoldCartSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Log = mongoose.model('Log', LogSchema);
const Backup = mongoose.model('Backup', BackupSchema);

// ==================== ইনিশিয়ালাইজেশন ====================

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

async function createLog(msg) {
    try {
        const newLog = new Log({ action: msg });
        await newLog.save();
        const logCount = await Log.countDocuments();
        if (logCount > 200) {
            const oldestLog = await Log.findOne().sort({ date: 1 });
            if (oldestLog) await Log.deleteOne({ _id: oldestLog._id });
        }
    } catch (e) { console.log("Log Error:", e); }
}

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

initializeUser();

// ==================== হোল্ড কার্ট রুটস ====================

// সব হোল্ড কার্ট দেখুন
app.get('/api/hold-carts', async (req, res) => {
    try {
        const carts = await HoldCart.find().sort({ holdDate: -1 });
        res.json(carts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// অ্যাক্টিভ হোল্ড কার্ট দেখুন (যেগুলো এক্সপায়ার হয়নি)
app.get('/api/hold-carts/active', async (req, res) => {
    try {
        const now = new Date();
        const carts = await HoldCart.find({ 
            expiresAt: { $gt: now } 
        }).sort({ holdDate: -1 });
        res.json(carts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নির্দিষ্ট হোল্ড কার্ট দেখুন
app.get('/api/hold-carts/:id', async (req, res) => {
    try {
        const cart = await HoldCart.findById(req.params.id);
        if (!cart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }
        res.json(cart);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// নতুন হোল্ড কার্ট তৈরি করুন
app.post('/api/hold-carts', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, discount, note } = req.body;
        
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // টোটাল ক্যালকুলেট করুন
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const itemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

        const holdCart = new HoldCart({
            cart,
            customerName: customerName || 'নাম নেই',
            customerMobile: customerMobile || 'N/A',
            customerAddress: customerAddress || 'N/A',
            discount: discount || 0,
            note: note || '',
            totalAmount,
            itemsCount
        });

        await holdCart.save();
        await createLog(`⏸️ কার্ট হোল্ড করা হয়েছে: ${customerName || 'নাম নেই'}, ${itemsCount} টি আইটেম`);

        res.status(201).json({
            success: true,
            message: 'Cart held successfully',
            holdCart
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// হোল্ড কার্ট আপডেট করুন
app.put('/api/hold-carts/:id', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, discount, note } = req.body;
        
        const holdCart = await HoldCart.findById(req.params.id);
        if (!holdCart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }

        if (cart) {
            holdCart.cart = cart;
            holdCart.totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            holdCart.itemsCount = cart.reduce((sum, item) => sum + item.qty, 0);
        }
        
        if (customerName) holdCart.customerName = customerName;
        if (customerMobile) holdCart.customerMobile = customerMobile;
        if (customerAddress) holdCart.customerAddress = customerAddress;
        if (discount !== undefined) holdCart.discount = discount;
        if (note !== undefined) holdCart.note = note;

        await holdCart.save();
        await createLog(`🔄 হোল্ড কার্ট আপডেট: ${holdCart.customerName}`);

        res.json({
            success: true,
            message: 'Hold cart updated',
            holdCart
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// হোল্ড কার্ট থেকে কার্ট লোড করুন (ডিলিট সহ)
app.post('/api/hold-carts/:id/load', async (req, res) => {
    try {
        const holdCart = await HoldCart.findById(req.params.id);
        if (!holdCart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }

        // কার্ট ডাটা রিটার্ন করুন
        res.json({
            success: true,
            cart: holdCart.cart,
            customerName: holdCart.customerName,
            customerMobile: holdCart.customerMobile,
            customerAddress: holdCart.customerAddress,
            discount: holdCart.discount,
            note: holdCart.note
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// হোল্ড কার্ট ডিলিট করুন (লোড করার পর বা ম্যানুয়ালি)
app.delete('/api/hold-carts/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        // পাসওয়ার্ড ভেরিফাই (ঐচ্ছিক)
        if (password) {
            const isValid = await verifyPassword(password);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        const holdCart = await HoldCart.findById(req.params.id);
        if (!holdCart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }

        await HoldCart.findByIdAndDelete(req.params.id);
        await createLog(`🗑️ হোল্ড কার্ট ডিলিট: ${holdCart.customerName}`);

        res.json({
            success: true,
            message: 'Hold cart deleted'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// এক্সপায়ার্ড হোল্ড কার্ট অটো-ক্লিন করুন
app.delete('/api/hold-carts/cleanup/expired', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const now = new Date();
        const result = await HoldCart.deleteMany({ expiresAt: { $lt: now } });

        await createLog(`🧹 ${result.deletedCount} টি এক্সপায়ার্ড হোল্ড কার্ট ডিলিট`);

        res.json({
            success: true,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== প্রোডাক্ট রুটস ====================

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ date: -1 });
        res.json(products);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

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

app.post('/api/products', async (req, res) => {
    try {
        const { password, ...productData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newProduct = new Product(productData);
        await newProduct.save();
        await createLog(`✅ নতুন পণ্য: ${newProduct.name}`);
        res.status(201).json(newProduct);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        await createLog(`🔄 পণ্য আপডেট: ${updatedProduct.name}`);
        res.json(updatedProduct);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const p = await Product.findById(req.params.id);
        if(p) {
            await createLog(`❌ পণ্য ডিলিট: ${p.name}`);
            await Product.findByIdAndDelete(req.params.id);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Product not found" });
        }
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ==================== সেলস রুটস ====================

app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 });
        res.json(sales);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

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

// চেকআউট (নতুন সেল)
app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, totalAmount, paidAmount, discount, paymentMethod, holdCartId } = req.body;
        
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        
        let totalCost = 0;
        let items = [];

        for (let item of cart) {
            const p = await Product.findById(item._id);
            if (!p) {
                return res.status(404).json({ error: `Product ${item.name} not found` });
            }
            
            if (p.stock < item.qty) {
                return res.status(400).json({ error: `${p.name} এর জন্য পর্যাপ্ত স্টক নেই! (স্টক: ${p.stock})` });
            }
            
            totalCost += (p.costPrice || 0) * item.qty;
            
            p.stock -= item.qty;
            await p.save();
            
            items.push({
                _id: p._id,
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
            discount: discount || 0
        });
        
        await newSale.save();

        // যদি হোল্ড কার্ট থেকে হয়, তাহলে সেটা ডিলিট করুন
        if (holdCartId) {
            await HoldCart.findByIdAndDelete(holdCartId);
        }

        await createLog(`🛒 বিক্রি: ${customerName || 'নগদ'}, ${totalAmount}৳`);

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
        
        await createLog(`💰 বাকি জমা: ${sale.customerName}, ${paidAmount}৳`);
        res.json({ success: true, sale });
        
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ==================== এক্সপেন্স রুটস ====================

app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ date: -1 });
        res.json(expenses);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const { password, ...expenseData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newExpense = new Expense(expenseData);
        await newExpense.save();
        await createLog(`💰 খরচ: ${newExpense.title} - ${newExpense.amount}৳`);
        res.status(201).json(newExpense);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ==================== লগ রুটস ====================

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(200);
        res.json(logs);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

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

// ==================== ব্যাকআপ রুটস ====================

app.get('/api/backups', async (req, res) => {
    try {
        const backups = await Backup.find().sort({ date: -1 }).limit(20);
        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        const holdCarts = await HoldCart.find();
        
        const backupData = {
            products,
            sales,
            expenses,
            logs,
            holdCarts,
            version: '2.0',
            date: new Date()
        };
        
        const backup = new Backup({
            name: `backup_${new Date().toISOString().slice(0,10)}`,
            data: backupData,
            size: JSON.stringify(backupData).length
        });
        
        await backup.save();
        await createLog('💾 ব্যাকআপ তৈরি');
        res.json({ success: true, backup });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        
        await Product.deleteMany({});
        await Sale.deleteMany({});
        await Expense.deleteMany({});
        await Log.deleteMany({});
        await HoldCart.deleteMany({});
        
        if (backup.data.products) await Product.insertMany(backup.data.products);
        if (backup.data.sales) await Sale.insertMany(backup.data.sales);
        if (backup.data.expenses) await Expense.insertMany(backup.data.expenses);
        if (backup.data.logs) await Log.insertMany(backup.data.logs);
        if (backup.data.holdCarts) await HoldCart.insertMany(backup.data.holdCarts);
        
        await createLog('📂 ব্যাকআপ থেকে পুনরুদ্ধার');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== স্ট্যাটস রুটস ====================

app.get('/api/stats', async (req, res) => {
    try {
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        const holdCarts = await HoldCart.find({ expiresAt: { $gt: new Date() } });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaySales = sales.filter(s => new Date(s.date) >= today);
        const todayTotal = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        const todayProfit = todaySales.reduce((acc, s) => acc + (s.profit || 0), 0);
        
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthSales = sales.filter(s => new Date(s.date) >= monthStart);
        const monthTotal = monthSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        
        let stockValue = products.reduce((acc, p) => acc + ((p.costPrice || 0) * (p.stock || 0)), 0);
        let totalSales = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        let grossProfit = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
        let totalDue = sales.reduce((acc, s) => acc + (s.dueAmount || 0), 0);
        let totalExpense = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
        let netProfit = grossProfit - totalExpense;

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
            totalProducts: products.length,
            totalStock: products.reduce((acc, p) => acc + p.stock, 0),
            expiredCount: expiredProducts.length,
            expiringCount: expiringSoonProducts.length,
            activeHoldCarts: holdCarts.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== সার্চ রুটস ====================

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

// ==================== অথেনটিকেশন রুটস ====================

app.post('/api/verify-password', async (req, res) => {
    try {
        const { password } = req.body;
        const isValid = await verifyPassword(password);
        res.json({ valid: isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/update-password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        
        const isValid = await verifyPassword(oldPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const user = await User.findOne();
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔐 পাসওয়ার্ড পরিবর্তন');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { currentPassword } = req.body;
        
        const isValid = await verifyPassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        const hashedPassword = await bcrypt.hash('1234', 10);
        const user = await User.findOne();
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔄 পাসওয়ার্ড রিসেট');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== হেলথ চেক ====================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        time: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ==================== স্ট্যাটিক ফাইল ====================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== এরর হ্যান্ডলার ====================

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// ==================== অটো ক্লিনআপ (প্রতি ঘন্টায়) ====================

setInterval(async () => {
    try {
        const now = new Date();
        const result = await HoldCart.deleteMany({ expiresAt: { $lt: now } });
        if (result.deletedCount > 0) {
            console.log(`🧹 Auto cleaned ${result.deletedCount} expired hold carts`);
        }
    } catch (err) {
        console.error('Auto cleanup error:', err);
    }
}, 60 * 60 * 1000); // প্রতি ঘন্টা

// ==================== সার্ভার স্টার্ট ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🛒 POS: http://localhost:${PORT}/pos.html`);
});
