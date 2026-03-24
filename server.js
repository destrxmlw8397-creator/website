const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'supershop_pro_secret_key_2024';

// MongoDB কানেকশন
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ Connection Error:", err));

// ==================== স্কিমা ডেফিনিশন ====================

// ইউজার স্কিমা (রোল যোগ করা হয়েছে)
const UserSchema = new mongoose.Schema({
    username: { type: String, default: 'admin' },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// প্রোডাক্ট স্কিমা (imageUrl যোগ করা হয়েছে)
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, default: "" },
    category: { type: String, default: "" },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    costPrice: { type: Number, default: 0 },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    alertLimit: { type: Number, default: 5 },
    expiryDate: { type: Date, default: null },
    imageUrl: { type: String, default: null },
    date: { type: Date, default: Date.now }
});

// সাপ্লায়ার স্কিমা (নতুন)
const SupplierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    dueAmount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// কাস্টমার স্কিমা (নতুন - বাকির জন্য)
const CustomerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    totalDue: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// সেলস স্কিমা (supplierId, customerId যোগ করা হয়েছে)
const SaleSchema = new mongoose.Schema({
    invoiceNo: { type: String, unique: true },
    customerName: { type: String, default: 'নগদ' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerMobile: { type: String, default: 'N/A' },
    customerAddress: { type: String, default: 'N/A' },
    items: [{
        _id: String,
        name: String,
        qty: Number,
        price: Number,
        costPrice: Number,
        category: String
    }],
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    discount: { type: Number, default: 0 },
    discountType: { type: String, default: 'flat' },
    date: { type: Date, default: Date.now }
});

// রিটার্ন স্কিমা (নতুন)
const ReturnSchema = new mongoose.Schema({
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    items: [{
        productId: String,
        name: String,
        qty: Number,
        price: Number,
        refundAmount: Number
    }],
    totalRefund: { type: Number, required: true },
    reason: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

// হোল্ড কার্ট স্কিমা (discountType যোগ)
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
    discountType: { type: String, default: 'flat' },
    note: { type: String, default: '' },
    totalAmount: { type: Number, default: 0 },
    itemsCount: { type: Number, default: 0 },
    holdDate: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(+new Date() + 24*60*60*1000) }
});

// এক্সপেন্স স্কিমা
const ExpenseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: "অন্যান্য" },
    date: { type: Date, default: Date.now }
});

// অ্যাক্টিভিটি লগ স্কিমা (user যোগ)
const LogSchema = new mongoose.Schema({
    user: { type: String, default: 'system' },
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
const Supplier = mongoose.model('Supplier', SupplierSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const Sale = mongoose.model('Sale', SaleSchema);
const Return = mongoose.model('Return', ReturnSchema);
const HoldCart = mongoose.model('HoldCart', HoldCartSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Log = mongoose.model('Log', LogSchema);
const Backup = mongoose.model('Backup', BackupSchema);

// ==================== ইনিশিয়ালাইজেশন ====================

async function initializeUser() {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('1234', 10);
            const user = new User({ username: 'admin', password: hashedPassword, role: 'admin' });
            await user.save();
            console.log('✅ Admin user created with password: 1234');
        }
        
        const staffExists = await User.findOne({ username: 'staff' });
        if (!staffExists) {
            const hashedPassword = await bcrypt.hash('1234', 10);
            const user = new User({ username: 'staff', password: hashedPassword, role: 'staff' });
            await user.save();
            console.log('✅ Staff user created with password: 1234');
        }
    } catch (error) {
        console.error('Error creating default user:', error);
    }
}

async function createLog(msg, user = 'system') {
    try {
        const newLog = new Log({ action: msg, user });
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

// JWT Token Functions
function generateToken(user) {
    return jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
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

// ==================== অথেনটিকেশন রুটস ====================

// Login with JWT
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'ইউজার নাম বা পাসওয়ার্ড ভুল' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'ইউজার নাম বা পাসওয়ার্ড ভুল' });
        }
        
        const token = generateToken(user);
        
        res.json({ 
            success: true, 
            token,
            user: { id: user._id, username: user.username, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify Token
app.post('/api/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        const decoded = await verifyToken(token);
        
        if (decoded) {
            const user = await User.findById(decoded.id);
            if (user) {
                return res.json({ valid: true, user: { id: user._id, username: user.username, role: user.role } });
            }
        }
        
        res.json({ valid: false });
    } catch (error) {
        res.json({ valid: false });
    }
});

// Middleware to check admin role
async function checkAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = await verifyToken(token);
    
    if (!decoded || decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = decoded;
    next();
}

// Update Password (requires old password)
app.post('/api/update-password', async (req, res) => {
    try {
        const { username, oldPassword, newPassword } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog(`🔐 পাসওয়ার্ড পরিবর্তন: ${username}`, username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset Password (admin only)
app.post('/api/reset-password', checkAdmin, async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword || '1234', 10);
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();
        
        await createLog(`🔄 পাসওয়ার্ড রিসেট: ${username}`, req.user.username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new user (admin only)
app.post('/api/users', checkAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password || '1234', 10);
        const user = new User({ username, password: hashedPassword, role: role || 'staff' });
        await user.save();
        
        await createLog(`👤 নতুন ইউজার তৈরি: ${username} (${role})`, req.user.username);
        res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users (admin only)
app.get('/api/users', checkAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete user (admin only)
app.delete('/api/users/:id', checkAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.username === 'admin') {
            return res.status(400).json({ error: 'Cannot delete admin user' });
        }
        
        await User.findByIdAndDelete(req.params.id);
        await createLog(`🗑️ ইউজার ডিলিট: ${user.username}`, req.user.username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== সাপ্লায়ার রুটস ====================

app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await Supplier.find().sort({ name: 1 });
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/suppliers', async (req, res) => {
    try {
        const { password, ...supplierData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const newSupplier = new Supplier(supplierData);
        await newSupplier.save();
        await createLog(`✅ নতুন সাপ্লায়ার: ${newSupplier.name}`);
        res.status(201).json(newSupplier);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/suppliers/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedSupplier = await Supplier.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedSupplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        await createLog(`🔄 সাপ্লায়ার আপডেট: ${updatedSupplier.name}`);
        res.json(updatedSupplier);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const supplier = await Supplier.findById(req.params.id);
        if (supplier) {
            await Supplier.findByIdAndDelete(req.params.id);
            await createLog(`❌ সাপ্লায়ার ডিলিট: ${supplier.name}`);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Supplier not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== কাস্টমার রুটস ====================

app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ name: 1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const { password, ...customerData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const existingCustomer = await Customer.findOne({ phone: customerData.phone });
        if (existingCustomer) {
            return res.status(400).json({ error: 'এই ফোন নম্বর দিয়ে কাস্টমার ইতিমধ্যে আছে' });
        }
        
        const newCustomer = new Customer(customerData);
        await newCustomer.save();
        await createLog(`✅ নতুন কাস্টমার: ${newCustomer.name}`);
        res.status(201).json(newCustomer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    try {
        const { password, ...updateData } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const updatedCustomer = await Customer.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedCustomer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        await createLog(`🔄 কাস্টমার আপডেট: ${updatedCustomer.name}`);
        res.json(updatedCustomer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const customer = await Customer.findById(req.params.id);
        if (customer) {
            await Customer.findByIdAndDelete(req.params.id);
            await createLog(`❌ কাস্টমার ডিলিট: ${customer.name}`);
            res.json({ message: "Deleted" });
        } else {
            res.status(404).json({ message: "Customer not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== লগ রুটস ====================

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(500);
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
        
        const result = await Log.deleteMany({});
        await createLog(`🧹 ${result.deletedCount} টি লগ মুছে ফেলা হয়েছে`);
        
        res.json({ 
            success: true, 
            deletedCount: result.deletedCount,
            message: 'সব লগ মুছে ফেলা হয়েছে' 
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
        const { cart, customerName, customerMobile, customerAddress, discount, discountType, note } = req.body;
        
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
            discountType: discountType || 'flat',
            note: note || '',
            totalAmount,
            itemsCount
        });

        await holdCart.save();
        await createLog(`⏸️ কার্ট হোল্ড: ${customerName || 'নাম নেই'}, ${itemsCount} টি আইটেম`);

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
            discountType: holdCart.discountType,
            note: holdCart.note
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hold-carts/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
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

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== প্রোডাক্ট রুটস ====================

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().populate('supplier', 'name').sort({ date: -1 });
        res.json(products);
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

// Generate invoice number
async function generateInvoiceNo() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const prefix = `INV-${year}${month}${day}-`;
    
    const lastSale = await Sale.findOne({ invoiceNo: { $regex: prefix } }).sort({ invoiceNo: -1 });
    let nextNum = 1;
    
    if (lastSale && lastSale.invoiceNo) {
        const lastNum = parseInt(lastSale.invoiceNo.split('-')[2]);
        nextNum = lastNum + 1;
    }
    
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

app.get('/api/sales', async (req, res) => {
    try {
        const sales = await Sale.find().sort({ date: -1 }).populate('customerId', 'name phone');
        res.json(sales);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/checkout', async (req, res) => {
    try {
        const { cart, customerName, customerMobile, customerAddress, customerPhone, totalAmount, paidAmount, discount, discountType, paymentMethod, holdCartId } = req.body;
        
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        
        let totalCost = 0;
        let items = [];
        let customerId = null;
        
        // Find or create customer
        if (customerPhone && customerPhone !== 'N/A') {
            let customer = await Customer.findOne({ phone: customerPhone });
            if (!customer && customerName !== 'নগদ') {
                customer = new Customer({ name: customerName || 'অতিথি', phone: customerPhone, address: customerAddress || '' });
                await customer.save();
            }
            if (customer) {
                customerId = customer._id;
            }
        }

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
                costPrice: p.costPrice,
                category: p.category
            });
        }

        let finalTotalAmount = totalAmount;
        let finalDiscount = discount || 0;
        
        // Apply discount if not already applied
        if (discountType === 'percent' && discount > 0) {
            finalDiscount = (totalAmount * discount) / 100;
            finalTotalAmount = totalAmount - finalDiscount;
        } else if (discountType === 'flat' && discount > 0) {
            finalDiscount = discount;
            finalTotalAmount = totalAmount - discount;
        }

        const profit = finalTotalAmount - totalCost;
        const dueAmount = finalTotalAmount - (paidAmount || 0);
        
        const invoiceNo = await generateInvoiceNo();

        const newSale = new Sale({
            invoiceNo,
            customerName: customerName || 'নগদ',
            customerId,
            customerMobile: customerMobile || 'N/A',
            customerAddress: customerAddress || 'N/A',
            items: items,
            totalAmount: finalTotalAmount,
            paidAmount: paidAmount || 0,
            dueAmount: dueAmount,
            profit: profit,
            paymentMethod: paymentMethod || 'cash',
            discount: finalDiscount,
            discountType: discountType || 'flat'
        });
        
        await newSale.save();
        
        // Update customer due
        if (customerId && dueAmount > 0) {
            await Customer.findByIdAndUpdate(customerId, { $inc: { totalDue: dueAmount } });
        }

        if (holdCartId) {
            await HoldCart.findByIdAndDelete(holdCartId);
        }

        await createLog(`🛒 বিক্রি: ${customerName || 'নগদ'}, ${finalTotalAmount}৳ (Invoice: ${invoiceNo})`);

        res.json({ 
            success: true, 
            sale: newSale,
            invoiceNo,
            message: 'Payment processed successfully' 
        });
        
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: err.message });
    }
});

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
        
        // Update customer due
        if (sale.customerId) {
            await Customer.findByIdAndUpdate(sale.customerId, { $inc: { totalDue: -Number(paidAmount) } });
        }
        
        await createLog(`💰 বাকি জমা: ${sale.customerName}, ${paidAmount}৳`);
        res.json({ success: true, sale });
        
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ==================== রিটার্ন রুটস ====================

app.post('/api/returns', async (req, res) => {
    try {
        const { password, saleId, items, reason } = req.body;
        
        const isValid = await verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({ error: "Sale not found" });
        }
        
        let totalRefund = 0;
        
        for (const returnItem of items) {
            const product = await Product.findById(returnItem.productId);
            if (product) {
                product.stock += returnItem.qty;
                await product.save();
            }
            
            const saleItem = sale.items.find(i => i._id.toString() === returnItem.productId);
            if (saleItem) {
                const refundAmount = saleItem.price * returnItem.qty;
                totalRefund += refundAmount;
            }
        }
        
        const newReturn = new Return({
            saleId,
            items,
            totalRefund,
            reason
        });
        
        await newReturn.save();
        
        // Update sale
        sale.totalAmount -= totalRefund;
        sale.paidAmount = Math.min(sale.paidAmount, sale.totalAmount);
        sale.dueAmount = sale.totalAmount - sale.paidAmount;
        await sale.save();
        
        await createLog(`🔄 রিটার্ন: ${sale.customerName}, ${totalRefund}৳`);
        res.json({ success: true, return: newReturn });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/returns', async (req, res) => {
    try {
        const returns = await Return.find().sort({ date: -1 }).populate('saleId');
        res.json(returns);
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
        
        // Top selling products
        const productSales = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productSales[item.name]) {
                    productSales[item.name] = { name: item.name, qty: 0, total: 0 };
                }
                productSales[item.name].qty += item.qty;
                productSales[item.name].total += item.qty * item.price;
            });
        });
        const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

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
            topProducts
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
        const suppliers = await Supplier.find();
        const customers = await Customer.find();
        
        const backupData = {
            products,
            sales,
            expenses,
            logs,
            holdCarts,
            suppliers,
            customers,
            version: '2.1',
            date: new Date()
        };
        
        const backup = new Backup({
            name: `backup_${new Date().toISOString().slice(0,10)}_${Date.now()}`,
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
        await Supplier.deleteMany({});
        await Customer.deleteMany({});
        
        if (backup.data.products) await Product.insertMany(backup.data.products);
        if (backup.data.sales) await Sale.insertMany(backup.data.sales);
        if (backup.data.expenses) await Expense.insertMany(backup.data.expenses);
        if (backup.data.logs) await Log.insertMany(backup.data.logs);
        if (backup.data.holdCarts) await HoldCart.insertMany(backup.data.holdCarts);
        if (backup.data.suppliers) await Supplier.insertMany(backup.data.suppliers);
        if (backup.data.customers) await Customer.insertMany(backup.data.customers);
        
        await createLog('📂 ব্যাকআপ থেকে পুনরুদ্ধার');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    } catch (err) {
        console.error('Log cleanup error:', err);
    }
}, 6 * 60 * 60 * 1000);

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
