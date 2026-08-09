const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/route_optimizer';
    await mongoose.connect(uri);
    console.log('✅ MongoDB متصلة بنجاح');
  } catch (err) {
    console.error('❌ فشل الاتصال بـ MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
