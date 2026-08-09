const express = require('express');
const router = express.Router();
const upload = require('../config/multerConfig');
const { processTrip } = require('../controllers/processController');

// الـ endpoint الوحيد اللي المستخدم النهائي بيتعامل معاه:
// رفع الإكسل + نقطة البداية → يرجعله المسار الكامل مرتب دفعة واحدة
// body: multipart/form-data { file, startLat, startLng }
router.post('/', upload.single('file'), processTrip);

module.exports = router;
