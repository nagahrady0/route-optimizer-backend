const mongoose = require('mongoose');

// كل عنوان بيتحول لإحداثيات مرة واحدة بس، وبعدين بنكاشه هنا
// عشان لو نفس العنوان اتكرر في ملف تاني، مانعملش Geocoding تاني ليه
const LocationCacheSchema = new mongoose.Schema({
  // النص الأصلي بعد التنضيف (trim + lowercase) عشان يبقى مفتاح بحث موحّد
  normalizedAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  rawAddress: {
    type: String,
    required: true
  },
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  },
  // مين اللي رجع النتيجة دي (nominatim / google) - مفيد للتتبع
  provider: {
    type: String,
    default: 'nominatim'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LocationCache', LocationCacheSchema);
