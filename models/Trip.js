const mongoose = require('mongoose');

// سكيما المكان الواحد (نقطة توصيل)
const LocationPointSchema = new mongoose.Schema({
  // الترتيب الأصلي في ملف الإكسل (قبل التحسين)
  originalIndex: {
    type: Number,
    required: true
  },
  // النص زي ما جه من الإكسل (عنوان أو إحداثيات)
  rawAddress: {
    type: String,
    required: true
  },
  // الإحداثيات بعد الـ Geocoding (بتتملى لاحقًا، مش وقت الرفع)
  lat: {
    type: Number,
    default: null
  },
  lng: {
    type: Number,
    default: null
  },
  // حالة الـ Geocoding لكل نقطة لوحدها (مفيد لو عنوان معين فشل والباقي نجح)
  geocodeStatus: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },
  // ترتيب الزيارة بعد التحسين (0 = أول محطة بعد نقطة البداية)
  visitOrder: {
    type: Number,
    default: null
  },
  // المسافة من المحطة اللي قبلها (بالمتر) - بتتحسب بعد التحسين
  distanceFromPrevious: {
    type: Number,
    default: null
  }
}, { _id: false });

const TripSchema = new mongoose.Schema({
  // اسم الملف الأصلي اللي اترفع
  originalFileName: {
    type: String,
    required: true
  },

  // نقطة بداية المندوب
  startPoint: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    label: { type: String, default: 'نقطة البداية' }
  },

  // كل نقاط التسليم (قبل وبعد الترتيب)
  locations: {
    type: [LocationPointSchema],
    required: true
  },

  // إجمالي المسافة الكلية بعد التحسين (بالمتر)
  totalDistance: {
    type: Number,
    default: null
  },

  // حالة الرحلة
  status: {
    type: String,
    enum: ['pending', 'geocoding', 'optimizing', 'completed', 'failed'],
    default: 'pending'
  },

  // رسالة الخطأ لو الرحلة فشلت
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true // بيضيف createdAt و updatedAt أوتوماتيك
});

module.exports = mongoose.model('Trip', TripSchema);
