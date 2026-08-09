require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// اتصال قاعدة البيانات
connectDB();

// خدمة ملفات الـ PDF المولّدة كملفات ثابتة قابلة للتحميل
// أي ملف في public/pdfs بيبقى متاح على الرابط /pdfs/اسم_الملف
app.use('/pdfs', express.static(path.join(__dirname, 'public', 'pdfs')));

// Health check - للتأكد إن السيرفر شغال
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'السيرفر شغال تمام' });
});

// routes الرحلات (الخطوات المنفصلة - رفع/geocode/optimize - مفيدة للاختبار والصيانة)
app.use('/api/trips', require('./routes/tripRoutes'));

// الـ endpoint الموحّد اللي المستخدم النهائي بيستخدمه فعليًا
// بيعمل رفع + geocoding + تحسين المسار في نداء واحد بس
app.use('/api/process', require('./routes/processRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
