const express = require('express');
const router = express.Router();
const upload = require('../config/multerConfig');
const { uploadExcel, geocodeTrip, optimizeTripRoute } = require('../controllers/tripController');

// رفع ملف إكسل وإنشاء رحلة جديدة
// body: multipart/form-data { file, startLat, startLng }
router.post('/upload', upload.single('file'), uploadExcel);

// تحويل عناوين رحلة معينة لإحداثيات (Geocoding)
// params: id (tripId)
router.post('/:id/geocode', geocodeTrip);

// ترتيب أفضل مسار زيارة للنقاط (بعد الـ geocoding)
// params: id (tripId)
router.post('/:id/optimize', optimizeTripRoute);

module.exports = router;
