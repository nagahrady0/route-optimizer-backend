require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { requireAuth } = require('./middleware/authMiddleware');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// اتصال قاعدة البيانات
connectDB();

// خدمة ملفات الـ PDF المولّدة كملفات ثابتة قابلة للتحميل
// ⚠️ ملحوظة أمان: الملفات دي بتفضل متاحة لأي حد عنده الرابط المباشر (زي أي CDN عادي)
// من غير التحقق من تسجيل الدخول - لو محتاج حماية أعلى (منع مشاركة الرابط)، لازم Endpoint
// منفصل يتحقق من الـ Token قبل ما يبعت الملف، بدل express.static المباشر ده
app.use('/pdfs', express.static(path.join(__dirname, 'public', 'pdfs')));

// Health check - للتأكد إن السيرفر شغال (مفتوح، مش محتاج تسجيل دخول)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'السيرفر شغال تمام' });
});

// routes التسجيل وتسجيل الدخول (مفتوحة بطبيعتها - مينفعش تتطلب تسجيل دخول علشان تسجّل دخول)
app.use('/api/auth', require('./routes/authRoutes'));

// من هنا وتحت: كل الـ routes محمية، لازم Authorization: Bearer <token> صالح
// routes الرحلات (الخطوات المنفصلة - رفع/geocode/optimize - مفيدة للاختبار والصيانة)
app.use('/api/trips', requireAuth, require('./routes/tripRoutes'));

// الـ endpoint الموحّد اللي المستخدم النهائي بيستخدمه فعليًا
// بيعمل رفع + geocoding + تحسين المسار في نداء واحد بس
app.use('/api/process', requireAuth, require('./routes/processRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
