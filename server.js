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

// ইউজার স্কিমা (আপডেটেড - রোল যোগ করা হয়েছে)
const UserSchema = new mongoose.Schema({
    username: { type: String, default: 'admin' },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'staff'], default: 'admin' },
    name: { type: String, default: 'Administrator' },
    lastLogin: { type: Date },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// প্রোডাক্ট স্কিমা (আপডেটেড - imageUrl যোগ করা হয়েছে)
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
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null },
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
        category: String,
        costPrice: { type: Number, default: 0 }
    }],
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    discount: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' }
});

// স্টক মুভমেন্ট লগ স্কিমা (নতুন)
const StockMovementSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    type: { type: String, enum: ['purchase', 'sale', 'adjustment', 'return'], required: true },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    referenceId: { type: String },
    note: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
});

// গ্রাহক স্কিমা (নতুন)
const CustomerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    address: { type: String, default: '' },
    email: { type: String, default: '' },
    totalPurchases: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    lastPurchaseDate: { type: Date },
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// হোল্ড কার্ট স্কিমা
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
    expiresAt: { type: Date, default: () => new Date(+new Date() + 24*60*60*1000) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// এক্সপেন্স স্কিমা
const ExpenseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: "অন্যান্য" },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' }
});

// অ্যাক্টিভিটি লগ স্কিমা
const LogSchema = new mongoose.Schema({
    action: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, default: 'system' },
    date: { type: Date, default: Date.now }
});

// ব্যাকআপ স্কিমা
const BackupSchema = new mongoose.Schema({
    name: String,
    data: Object,
    size: Number,
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// দৈনিক ক্লোজিং স্কিমা (নতুন)
const DailyClosingSchema = new mongoose.Schema({
    closingDate: { type: Date, required: true, unique: true },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openingTime: { type: Date },
    closingTime: { type: Date },
    
    totalSales: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    
    cashSales: { type: Number, default: 0 },
    bkashSales: { type: Number, default: 0 },
    cardSales: { type: Number, default: 0 },
    
    totalExpenses: { type: Number, default: 0 },
    dueCollected: { type: Number, default: 0 },
    newDue: { type: Number, default: 0 },
    
    openingCash: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    actualCash: { type: Number, default: 0 },
    cashDifference: { type: Number, default: 0 },
    
    productsSold: { type: Number, default: 0 },
    lowStockProducts: { type: Number, default: 0 },
    expiredProducts: { type: Number, default: 0 },
    
    remarks: { type: String, default: '' },
    status: { type: String, enum: ['open', 'closed'], default: 'open' }
});

// মডেল তৈরি
const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const HoldCart = mongoose.model('HoldCart', HoldCartSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Log = mongoose.model('Log', LogSchema);
const Backup = mongoose.model('Backup', BackupSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const StockMovement = mongoose.model('StockMovement', StockMovementSchema);
const DailyClosing = mongoose.model('DailyClosing', DailyClosingSchema);

// ==================== ইনিশিয়ালাইজেশন ====================

async function initializeUser() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('1234', 10);
            const admin = new User({ 
                username: 'admin',
                password: hashedPassword,
                role: 'admin',
                name: 'Administrator'
            });
            await admin.save();
            
            const staffPassword = await bcrypt.hash('5678', 10);
            const staff = new User({
                username: 'staff',
                password: staffPassword,
                role: 'staff',
                name: 'Staff User'
            });
            await staff.save();
            
            console.log('✅ Default users created: admin/1234 (admin), staff/5678 (staff)');
        }
    } catch (error) {
        console.error('Error creating default users:', error);
    }
}

async function createLog(msg, userId = null, username = 'system') {
    try {
        const newLog = new Log({ 
            action: msg,
            userId: userId,
            username: username
        });
        await newLog.save();
        const logCount = await Log.countDocuments();
        if (logCount > 500) {
            const oldestLog = await Log.findOne().sort({ date: 1 });
            if (oldestLog) await Log.deleteOne({ _id: oldestLog._id });
        }
    } catch (e) { 
        console.log("Log Error:", e); 
    }
}

async function verifyPassword(username, inputPassword) {
    try {
        const user = await User.findOne({ username: username, isActive: true });
        if (!user) return false;
        return await bcrypt.compare(inputPassword, user.password);
    } catch (error) {
        console.error('Password verification error:', error);
        return false;
    }
}

async function createStockMovement(productId, productName, type, quantity, previousStock, referenceId = null, note = '', userId = null) {
    try {
        const product = await Product.findById(productId);
        if (!product) return false;
        
        const newStock = product.stock;
        
        const movement = new StockMovement({
            productId,
            productName,
            type,
            quantity,
            previousStock,
            newStock,
            referenceId,
            note,
            createdBy: userId
        });
        
        await movement.save();
        
        const count = await StockMovement.countDocuments();
        if (count > 1000) {
            const oldest = await StockMovement.findOne().sort({ date: 1 });
            if (oldest) await StockMovement.deleteOne({ _id: oldest._id });
        }
        
        return true;
    } catch (error) {
        console.error('Stock movement error:', error);
        return false;
    }
}

async function updateCustomerInfo(name, mobile, address, purchaseAmount = 0, dueAmount = 0) {
    try {
        if (!mobile || mobile === 'N/A') return null;
        
        let customer = await Customer.findOne({ mobile });
        
        if (customer) {
            customer.totalPurchases += purchaseAmount;
            customer.totalDue = dueAmount;
            customer.lastPurchaseDate = new Date();
            customer.updatedAt = new Date();
            await customer.save();
        } else {
            customer = new Customer({
                name: name || 'নাম নেই',
                mobile,
                address: address || '',
                totalPurchases: purchaseAmount,
                totalDue: dueAmount,
                lastPurchaseDate: new Date()
            });
            await customer.save();
        }
        
        return customer;
    } catch (error) {
        console.error('Customer update error:', error);
        return null;
    }
}

initializeUser();

// ==================== অথেনটিকেশন রুটস ====================

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username, isActive: true });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        user.lastLogin = new Date();
        await user.save();
        
        await createLog(`🔐 লগইন: ${user.name} (${user.role})`, user._id, user.name);
        
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify-password', async (req, res) => {
    try {
        const { username, password } = req.body;
        const isValid = await verifyPassword(username || 'admin', password);
        res.json({ valid: isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/update-password', async (req, res) => {
    try {
        const { username, oldPassword, newPassword } = req.body;
        
        const isValid = await verifyPassword(username || 'admin', oldPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const user = await User.findOne({ username: username || 'admin' });
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔐 পাসওয়ার্ড পরিবর্তন', user._id, user.name);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { username, currentPassword } = req.body;
        
        const isValid = await verifyPassword(username || 'admin', currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        const hashedPassword = await bcrypt.hash('1234', 10);
        const user = await User.findOne({ username: username || 'admin' });
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog('🔄 পাসওয়ার্ড রিসেট', user._id, user.name);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ইউজার ম্যানেজমেন্ট রুটস ====================

app.get('/api/users', async (req, res) => {
    try {
        const { username, password } = req.query;
        
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = await User.findOne({ username: username || 'admin' });
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { adminUsername, adminPassword, newUser } = req.body;
        
        const isValid = await verifyPassword(adminUsername || 'admin', adminPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const admin = await User.findOne({ username: adminUsername || 'admin' });
        if (admin.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const hashedPassword = await bcrypt.hash(newUser.password, 10);
        const user = new User({
            ...newUser,
            password: hashedPassword
        });
        
        await user.save();
        await createLog(`👤 নতুন ইউজার: ${user.name} (${user.role})`, admin._id, admin.name);
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { adminUsername, adminPassword, ...updateData } = req.body;
        
        const isValid = await verifyPassword(adminUsername || 'admin', adminPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const admin = await User.findOne({ username: adminUsername || 'admin' });
        if (admin.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }
        
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
        await createLog(`🔄 ইউজার আপডেট: ${user.name}`, admin._id, admin.name);
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { adminUsername, adminPassword } = req.body;
        
        const isValid = await verifyPassword(adminUsername || 'admin', adminPassword);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const admin = await User.findOne({ username: adminUsername || 'admin' });
        if (admin.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Cannot delete admin user' });
        }
        
        await User.findByIdAndDelete(req.params.id);
        await createLog(`🗑️ ইউজার ডিলিট: ${user.name}`, admin._id, admin.name);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== স্টক মুভমেন্ট রুটস ====================

app.get('/api/stock-movements', async (req, res) => {
    try {
        const { productId, limit = 100 } = req.query;
        
        let query = {};
        if (productId) query.productId = productId;
        
        const movements = await StockMovement.find(query)
            .sort({ date: -1 })
            .limit(parseInt(limit))
            .populate('createdBy', 'name');
        
        res.json(movements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stock-movements/product/:productId', async (req, res) => {
    try {
        const movements = await StockMovement.find({ productId: req.params.productId })
            .sort({ date: -1 })
            .limit(200)
            .populate('createdBy', 'name');
        
        res.json(movements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== গ্রাহক রুটস ====================

app.get('/api/customers', async (req, res) => {
    try {
        const { search, limit = 50 } = req.query;
        
        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { mobile: { $regex: search, $options: 'i' } }
                ]
            };
        }
        
        const customers = await Customer.find(query)
            .sort({ lastPurchaseDate: -1 })
            .limit(parseInt(limit));
        
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/customers/:mobile', async (req, res) => {
    try {
        const customer = await Customer.findOne({ mobile: req.params.mobile });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        const sales = await Sale.find({ customerMobile: req.params.mobile })
            .sort({ date: -1 })
            .limit(20);
        
        res.json({ customer, sales });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/customers/:mobile', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword('admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const customer = await Customer.findOneAndUpdate(
            { mobile: req.params.mobile },
            { ...updateData, updatedAt: new Date() },
            { new: true }
        );
        
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json({ success: true, customer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== দৈনিক ক্লোজিং রুটস ====================

app.post('/api/daily-closing/open', async (req, res) => {
    try {
        const { userId, openingCash } = req.body;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let closing = await DailyClosing.findOne({ closingDate: today });
        
        if (closing) {
            return res.status(400).json({ error: 'Today already opened' });
        }
        
        closing = new DailyClosing({
            closingDate: today,
            openedBy: userId,
            openingTime: new Date(),
            openingCash: openingCash || 0,
            status: 'open'
        });
        
        await closing.save();
        await createLog(`📊 দৈনিক ক্লোজিং ওপেন করা হয়েছে`);
        
        res.json({ success: true, closing });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/daily-closing/close', async (req, res) => {
    try {
        const { userId, actualCash, remarks } = req.body;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const closing = await DailyClosing.findOne({ closingDate: today, status: 'open' });
        if (!closing) {
            return res.status(404).json({ error: 'No open session found' });
        }
        
        const sales = await Sale.find({
            date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
        });
        
        const expenses = await Expense.find({
            date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
        });
        
        const cashSales = sales.filter(s => s.paymentMethod === 'cash')
            .reduce((sum, s) => sum + s.paidAmount, 0);
        const bkashSales = sales.filter(s => s.paymentMethod === 'bkash')
            .reduce((sum, s) => sum + s.paidAmount, 0);
        const cardSales = sales.filter(s => s.paymentMethod === 'card')
            .reduce((sum, s) => sum + s.paidAmount, 0);
        
        const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
        const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
        const totalDiscount = sales.reduce((sum, s) => sum + s.discount, 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const dueCollected = sales.reduce((sum, s) => sum + (s.paidAmount - s.totalAmount + s.dueAmount), 0);
        const newDue = sales.reduce((sum, s) => sum + s.dueAmount, 0);
        
        const products = await Product.find();
        const lowStockProducts = products.filter(p => p.stock <= p.alertLimit).length;
        const expiredProducts = products.filter(p => p.expiryDate && new Date(p.expiryDate) < today).length;
        
        const expectedCash = closing.openingCash + cashSales - totalExpenses;
        
        closing.closedBy = userId;
        closing.closingTime = new Date();
        closing.totalSales = totalSales;
        closing.totalProfit = totalProfit;
        closing.totalDiscount = totalDiscount;
        closing.cashSales = cashSales;
        closing.bkashSales = bkashSales;
        closing.cardSales = cardSales;
        closing.totalExpenses = totalExpenses;
        closing.dueCollected = dueCollected;
        closing.newDue = newDue;
        closing.expectedCash = expectedCash;
        closing.actualCash = actualCash || expectedCash;
        closing.cashDifference = (actualCash || expectedCash) - expectedCash;
        closing.productsSold = sales.reduce((sum, s) => sum + s.items.reduce((itemSum, item) => itemSum + item.qty, 0), 0);
        closing.lowStockProducts = lowStockProducts;
        closing.expiredProducts = expiredProducts;
        closing.remarks = remarks || '';
        closing.status = 'closed';
        
        await closing.save();
        await createLog(`📊 দৈনিক ক্লোজিং সম্পন্ন হয়েছে`);
        
        res.json({ success: true, closing });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/daily-closing', async (req, res) => {
    try {
        const { startDate, endDate, limit = 30 } = req.query;
        
        let query = {};
        if (startDate && endDate) {
            query.closingDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        const closings = await DailyClosing.find(query)
            .sort({ closingDate: -1 })
            .limit(parseInt(limit))
            .populate('openedBy', 'name')
            .populate('closedBy', 'name');
        
        res.json(closings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/daily-closing/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const closing = await DailyClosing.findOne({ closingDate: today })
            .populate('openedBy', 'name')
            .populate('closedBy', 'name');
        
        res.json(closing || { status: 'not_opened' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== লগ রুটস ====================

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find()
            .sort({ date: -1 })
            .limit(200)
            .populate('userId', 'name');
        res.json(logs);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/logs', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const result = await Log.deleteMany({});
        await createLog(`🧹 ${result.deletedCount} টি লগ মুছে ফেলা হয়েছে`, user._id, user.name);
        
        res.json({ 
            success: true, 
            deletedCount: result.deletedCount,
            message: 'সব লগ মুছে ফেলা হয়েছে' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs/cleanup', async (req, res) => {
    try {
        const { username, password, days } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (days || 30));
        
        const result = await Log.deleteMany({ date: { $lt: cutoffDate } });
        
        await createLog(`🧹 ${result.deletedCount} টি পুরাতন লগ ডিলিট`, user._id, user.name);
        
        res.json({ 
            success: true, 
            deletedCount: result.deletedCount 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== হোল্ড কার্ট রুটস ====================

app.get('/api/hold-carts', async (req, res) => {
    try {
        const carts = await HoldCart.find().sort({ holdDate: -1 });
        res.json(carts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.post('/api/hold-carts', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, discount, note, userId, username } = req.body;
        
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

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
            itemsCount,
            createdBy: userId
        });

        await holdCart.save();
        await createLog(`⏸️ কার্ট হোল্ড: ${customerName || 'নাম নেই'}, ${itemsCount} টি আইটেম`, userId, username);

        res.status(201).json({
            success: true,
            message: 'Cart held successfully',
            holdCart
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hold-carts/:id/load', async (req, res) => {
    try {
        const holdCart = await HoldCart.findById(req.params.id);
        if (!holdCart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }

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

app.delete('/api/hold-carts/:id', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const holdCart = await HoldCart.findById(req.params.id);
        if (!holdCart) {
            return res.status(404).json({ error: 'Hold cart not found' });
        }

        await HoldCart.findByIdAndDelete(req.params.id);
        await createLog(`🗑️ হোল্ড কার্ট ডিলিট: ${holdCart.customerName}`, user?._id, user?.name);

        res.json({ success: true });
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

app.post('/api/products', async (req, res) => {
    try {
        const { username, password, ...productData } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user && user.role === 'staff') {
            return res.status(403).json({ error: 'Staff cannot add products' });
        }
        
        const newProduct = new Product(productData);
        await newProduct.save();
        
        await createStockMovement(
            newProduct._id,
            newProduct.name,
            'purchase',
            newProduct.stock,
            0,
            null,
            'নতুন পণ্য যোগ',
            user?._id
        );
        
        await createLog(`✅ নতুন পণ্য: ${newProduct.name}`, user?._id, user?.name);
        res.status(201).json(newProduct);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { username, password, ...updateData } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user && user.role === 'staff') {
            return res.status(403).json({ error: 'Staff cannot edit products' });
        }
        
        const oldProduct = await Product.findById(req.params.id);
        if (!oldProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const stockChanged = updateData.stock !== undefined && updateData.stock !== oldProduct.stock;
        const oldStock = oldProduct.stock;
        
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        
        if (stockChanged) {
            await createStockMovement(
                updatedProduct._id,
                updatedProduct.name,
                'adjustment',
                updateData.stock - oldStock,
                oldStock,
                null,
                'স্টক এডজাস্টমেন্ট',
                user?._id
            );
        }
        
        await createLog(`🔄 পণ্য আপডেট: ${updatedProduct.name}`, user?._id, user?.name);
        res.json(updatedProduct);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user && user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can delete products' });
        }
        
        const p = await Product.findById(req.params.id);
        if(p) {
            await createLog(`❌ পণ্য ডিলিট: ${p.name}`, user?._id, user?.name);
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
        const sales = await Sale.find().sort({ date: -1 }).populate('createdBy', 'name');
        res.json(sales);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/checkout', async (req, res) => {
    try {
        const { 
            cart, customerName, customerMobile, customerAddress, 
            totalAmount, paidAmount, discount, paymentMethod, holdCartId,
            userId, username 
        } = req.body;
        
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
            
            const oldStock = p.stock;
            totalCost += (p.costPrice || 0) * item.qty;
            
            p.stock -= item.qty;
            await p.save();
            
            await createStockMovement(
                p._id,
                p.name,
                'sale',
                item.qty,
                oldStock,
                null,
                `বিক্রয়: ${customerName || 'নগদ'}`,
                userId
            );
            
            items.push({
                _id: p._id,
                name: p.name,
                qty: item.qty,
                price: p.price,
                category: p.category,
                costPrice: p.costPrice || 0
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
            createdBy: userId
        });
        
        await newSale.save();

        if (customerMobile && customerMobile !== 'N/A') {
            await updateCustomerInfo(customerName, customerMobile, customerAddress, totalAmount, dueAmount);
        }

        if (holdCartId) {
            await HoldCart.findByIdAndDelete(holdCartId);
        }

        await createLog(`🛒 বিক্রি: ${customerName || 'নগদ'}, ${totalAmount}৳`, userId, username);

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

app.post('/api/sales/pay-due/:id', async (req, res) => {
    try {
        const { username, password, paidAmount } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
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
        
        await createLog(`💰 বাকি জমা: ${sale.customerName}, ${paidAmount}৳`, user?._id, user?.name);
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
        const { username, password, ...expenseData } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newExpense = new Expense({
            ...expenseData,
            createdBy: user?._id
        });
        await newExpense.save();
        await createLog(`💰 খরচ: ${newExpense.title} - ${newExpense.amount}৳`, user?._id, user?.name);
        res.status(201).json(newExpense);
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
        const customers = await Customer.find();
        
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

        const todayCash = todaySales.filter(s => s.paymentMethod === 'cash').reduce((acc, s) => acc + (s.paidAmount || 0), 0);
        const todayBkash = todaySales.filter(s => s.paymentMethod === 'bkash').reduce((acc, s) => acc + (s.paidAmount || 0), 0);
        const todayCard = todaySales.filter(s => s.paymentMethod === 'card').reduce((acc, s) => acc + (s.paidAmount || 0), 0);

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
            activeHoldCarts: holdCarts.length,
            totalCustomers: customers.length,
            todayCash,
            todayBkash,
            todayCard
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== লাভ-লস রিপোর্ট ====================

app.get('/api/profit-loss', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }
        
        const sales = await Sale.find(dateFilter);
        const expenses = await Expense.find(dateFilter);
        
        const categorySales = {};
        const categoryProfit = {};
        
        sales.forEach(sale => {
            sale.items.forEach(item => {
                const cat = item.category || 'অন্যান্য';
                if (!categorySales[cat]) categorySales[cat] = 0;
                if (!categoryProfit[cat]) categoryProfit[cat] = 0;
                
                categorySales[cat] += item.price * item.qty;
                const itemCost = (item.costPrice || 0) * item.qty;
                categoryProfit[cat] += (item.price * item.qty) - itemCost;
            });
        });
        
        const productSales = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productSales[item.name]) {
                    productSales[item.name] = {
                        quantity: 0,
                        amount: 0,
                        profit: 0
                    };
                }
                productSales[item.name].quantity += item.qty;
                productSales[item.name].amount += item.price * item.qty;
                const itemCost = (item.costPrice || 0) * item.qty;
                productSales[item.name].profit += (item.price * item.qty) - itemCost;
            });
        });
        
        const totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
        const totalProfit = sales.reduce((acc, s) => acc + s.profit, 0);
        const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);
        
        res.json({
            period: { startDate, endDate },
            summary: {
                totalSales,
                totalProfit,
                totalExpense,
                netProfit: totalProfit - totalExpense,
                transactionCount: sales.length,
                expenseCount: expenses.length
            },
            categorySales: Object.keys(categorySales).map(cat => ({
                category: cat,
                sales: categorySales[cat],
                profit: categoryProfit[cat]
            })),
            topProducts: Object.keys(productSales)
                .map(name => ({ name, ...productSales[name] }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 20)
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

// ==================== ব্যাকআপ রুটস ====================

app.get('/api/backups', async (req, res) => {
    try {
        const backups = await Backup.find().sort({ date: -1 }).limit(50);
        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backup', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const products = await Product.find();
        const sales = await Sale.find();
        const expenses = await Expense.find();
        const logs = await Log.find();
        const holdCarts = await HoldCart.find();
        const customers = await Customer.find();
        const users = await User.find().select('-password');
        
        const backupData = {
            products,
            sales,
            expenses,
            logs,
            holdCarts,
            customers,
            users,
            version: '2.0',
            date: new Date()
        };
        
        const backup = new Backup({
            name: `backup_${new Date().toISOString().slice(0,10)}_${Date.now()}`,
            data: backupData,
            size: JSON.stringify(backupData).length,
            createdBy: user?._id
        });
        
        await backup.save();
        await createLog('💾 ব্যাকআপ তৈরি', user?._id, user?.name);
        
        res.json({ success: true, backup });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restore', async (req, res) => {
    try {
        const { username, password, backupId } = req.body;
        
        const user = await User.findOne({ username: username || 'admin' });
        const isValid = await verifyPassword(username || 'admin', password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
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
        await Customer.deleteMany({});
        
        if (backup.data.products) await Product.insertMany(backup.data.products);
        if (backup.data.sales) await Sale.insertMany(backup.data.sales);
        if (backup.data.expenses) await Expense.insertMany(backup.data.expenses);
        if (backup.data.logs) await Log.insertMany(backup.data.logs);
        if (backup.data.holdCarts) await HoldCart.insertMany(backup.data.holdCarts);
        if (backup.data.customers) await Customer.insertMany(backup.data.customers);
        
        await createLog('📂 ব্যাকআপ থেকে পুনরুদ্ধার', user._id, user.name);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== এক্সপোর্ট রিপোর্ট ====================

app.post('/api/export/sales', async (req, res) => {
    try {
        const { startDate, endDate, format = 'json' } = req.body;
        
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }
        
        const sales = await Sale.find(dateFilter).sort({ date: -1 });
        
        if (format === 'json') {
            res.json(sales);
        } else if (format === 'csv') {
            let csv = 'Date,Customer,Mobile,Total,Paid,Due,Payment Method,Discount,Profit\n';
            
            sales.forEach(sale => {
                const date = new Date(sale.date).toLocaleDateString('bn-BD');
                csv += `"${date}","${sale.customerName}","${sale.customerMobile}",${sale.totalAmount},${sale.paidAmount},${sale.dueAmount},"${sale.paymentMethod}",${sale.discount},${sale.profit}\n`;
            });
            
            res.header('Content-Type', 'text/csv');
            res.attachment(`sales_${startDate}_to_${endDate}.csv`);
            res.send(csv);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== কিবোর্ড শর্টকাট API ====================

const keyboardShortcuts = {
    'pos': {
        'F2': { action: 'focusSearch', description: 'সার্চ বক্সে ফোকাস' },
        'F3': { action: 'clearCart', description: 'কার্ট খালি' },
        'F4': { action: 'applyDiscount', description: 'ডিসকাউন্ট প্রয়োগ' },
        'F5': { action: 'holdCart', description: 'কার্ট হোল্ড' },
        'F8': { action: 'processPayment', description: 'পেমেন্ট প্রসেস' },
        'F9': { action: 'loadProducts', description: 'পণ্য রিফ্রেশ' },
        'Ctrl+Shift+H': { action: 'showHeldCarts', description: 'হোল্ড কার্ট দেখান' },
        'Ctrl+Shift+C': { action: 'clearCart', description: 'কার্ট খালি' }
    },
    'dashboard': {
        'F5': { action: 'refreshDashboard', description: 'ড্যাশবোর্ড রিফ্রেশ' },
        'Ctrl+Shift+P': { action: 'printReport', description: 'রিপোর্ট প্রিন্ট' },
        'Ctrl+Shift+E': { action: 'exportExcel', description: 'এক্সেল এক্সপোর্ট' },
        'Ctrl+Shift+D': { action: 'toggleDarkMode', description: 'ডার্ক মোড টগল' }
    }
};

app.get('/api/shortcuts', (req, res) => {
    res.json(keyboardShortcuts);
});

// ==================== হেলথ চেক ====================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        time: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ==================== অটো ক্লিনআপ ====================

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
}, 60 * 60 * 1000);

setInterval(async () => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 60);
        
        const result = await Log.deleteMany({ date: { $lt: cutoffDate } });
        if (result.deletedCount > 0) {
            console.log(`🧹 Auto cleaned ${result.deletedCount} old logs`);
        }
        
        const stockCutoff = new Date();
        stockCutoff.setDate(stockCutoff.getDate() - 90);
        const stockResult = await StockMovement.deleteMany({ date: { $lt: stockCutoff } });
        if (stockResult.deletedCount > 0) {
            console.log(`🧹 Auto cleaned ${stockResult.deletedCount} old stock movements`);
        }
    } catch (err) {
        console.error('Log cleanup error:', err);
    }
}, 6 * 60 * 60 * 1000);

// ==================== অটো ব্যাকআপ শিডিউলার ====================

const scheduleBackup = () => {
    const now = new Date();
    const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0
    );
    const msToMidnight = night.getTime() - now.getTime();
    
    setTimeout(async () => {
        await performAutoBackup();
        setInterval(performAutoBackup, 24 * 60 * 60 * 1000);
    }, msToMidnight);
};

async function performAutoBackup() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentBackup = await Backup.findOne({
            date: { $gte: sevenDaysAgo }
        });
        
        if (!recentBackup) {
            const products = await Product.find();
            const sales = await Sale.find();
            const expenses = await Expense.find();
            const logs = await Log.find();
            const holdCarts = await HoldCart.find();
            const customers = await Customer.find();
            
            const backupData = {
                products,
                sales,
                expenses,
                logs,
                holdCarts,
                customers,
                version: '2.0',
                date: new Date()
            };
            
            const backup = new Backup({
                name: `auto_backup_${new Date().toISOString().slice(0,10)}`,
                data: backupData,
                size: JSON.stringify(backupData).length
            });
            
            await backup.save();
            console.log('💾 Auto backup created successfully');
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            await Backup.deleteMany({ date: { $lt: thirtyDaysAgo } });
        }
    } catch (error) {
        console.error('Auto backup error:', error);
    }
}

scheduleBackup();

// ==================== স্ট্যাটিক ফাইল ====================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== এরর হ্যান্ডলার ====================

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// ==================== সার্ভার স্টার্ট ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🛒 POS: http://localhost:${PORT}/pos.html`);
});
