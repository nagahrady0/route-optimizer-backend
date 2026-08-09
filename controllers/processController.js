const ExcelJS = require('exceljs');
const fs = require('fs');
const Trip = require('../models/Trip');
const { geocodeLocationsList } = require('../utils/geocodeService');
const { optimizeRoute } = require('../utils/routeOptimizer');
const { generateTripPdf } = require('../utils/pdfGenerator');

/**
 * بيدور على عمود "الأماكن" جوه ملف الإكسل بشكل مرن
 * (نفس المنطق المستخدم في tripController، منقول هنا عشان الملف يبقى مستقل بذاته)
 */
function findLocationColumnIndex(headerRow) {
  const possibleNames = ['مكان', 'المكان', 'عنوان', 'العنوان', 'الموقع', 'موقع', 'location', 'address'];
  let foundIndex = null;

  headerRow.eachCell((cell, colNumber) => {
    const cellValue = (cell.value || '').toString().trim().toLowerCase();
    if (possibleNames.some(name => cellValue.includes(name.toLowerCase()))) {
      foundIndex = colNumber;
    }
  });

  return foundIndex;
}

/**
 * POST /api/process
 * الـ endpoint الموحّد اللي المستخدم فعليًا هيتعامل معاه:
 * بياخد ملف إكسل + نقطة بداية، وبيعمل كل الخطوات تلقائيًا:
 * 1) قراءة الإكسل واستخراج الأماكن
 * 2) تحويل العناوين لإحداثيات (Geocoding)
 * 3) ترتيب أفضل مسار زيارة
 * وبيرجع النتيجة النهائية الكاملة دفعة واحدة
 */
async function processTrip(req, res) {
  let filePath = null;

  try {
    // ===== 1) التحقق من المدخلات =====
    if (!req.file) {
      return res.status(400).json({ error: 'محتاج ترفع ملف إكسل الأول' });
    }

    const { startLat, startLng } = req.body;
    if (!startLat || !startLng) {
      return res.status(400).json({
        error: 'محتاج تبعت إحداثيات نقطة البداية (startLat, startLng)'
      });
    }

    filePath = req.file.path;

    // ===== 2) قراءة الإكسل واستخراج الأماكن =====
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    const headerRow = worksheet.getRow(1);
    const locationColIndex = findLocationColumnIndex(headerRow);

    if (!locationColIndex) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: 'معرفتش ألاقي عمود الأماكن. تأكد إن فيه عمود اسمه "مكان" أو "عنوان" أو "location"'
      });
    }

    const rawLocations = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const cellValue = row.getCell(locationColIndex).value;
      const rawAddress = cellValue ? cellValue.toString().trim() : null;

      if (rawAddress) {
        rawLocations.push({
          originalIndex: rowNumber - 2,
          rawAddress,
          lat: null,
          lng: null,
          geocodeStatus: 'pending',
          visitOrder: null,
          distanceFromPrevious: null
        });
      }
    });

    fs.unlinkSync(filePath);
    filePath = null; // اتمسح خلاص، مانحاولش نمسحه تاني في catch لو حصل خطأ بعد كده

    if (rawLocations.length === 0) {
      return res.status(400).json({ error: 'عمود الأماكن فاضي، مفيش حاجة نشتغل عليها' });
    }

    // ===== 3) إنشاء الـ Trip في الداتابيز =====
    const trip = await Trip.create({
      originalFileName: req.file.originalname,
      startPoint: {
        lat: parseFloat(startLat),
        lng: parseFloat(startLng),
        label: 'نقطة البداية'
      },
      locations: rawLocations,
      status: 'geocoding'
    });

    // ===== 4) تحويل العناوين لإحداثيات =====
    const geocodedLocations = await geocodeLocationsList(trip.locations);
    trip.locations = geocodedLocations;
    await trip.save();

    const successfulLocations = geocodedLocations.filter(
      loc => loc.geocodeStatus === 'success' && loc.lat !== null && loc.lng !== null
    );
    const failedLocations = geocodedLocations.filter(
      loc => loc.geocodeStatus !== 'success' || loc.lat === null || loc.lng === null
    );

    if (successfulLocations.length === 0) {
      trip.status = 'failed';
      trip.errorMessage = 'كل العناوين فشلت في التحويل لإحداثيات';
      await trip.save();
      return res.status(422).json({
        error: 'كل العناوين فشلت في التحويل لإحداثيات، راجع صياغة العناوين في الملف',
        tripId: trip._id
      });
    }

    // ===== 5) ترتيب أفضل مسار زيارة =====
    trip.status = 'optimizing';
    await trip.save();

    const { orderedLocations, totalDistance } = optimizeRoute(
      trip.startPoint,
      successfulLocations
    );

    trip.locations = [...orderedLocations, ...failedLocations];
    trip.totalDistance = totalDistance;
    trip.status = 'completed';
    await trip.save();

    // ===== 6) توليد ملف PDF بالمسار + خريطة مصغرة =====
    // لو فشل توليد الـ PDF لأي سبب (مثلاً مشكلة شبكة وقت تحميل الخريطة)،
    // منوقفش الطلب كله - المستخدم لسه محتاج المسار حتى لو من غير PDF
    let pdfUrl = null;
    try {
      const pdfFileName = await generateTripPdf(trip);
      pdfUrl = `/pdfs/${pdfFileName}`;
    } catch (pdfErr) {
      console.error('فشل توليد PDF (الرحلة اتحسبت بنجاح برضو):', pdfErr.message);
    }

    // ===== 7) الرد النهائي الكامل دفعة واحدة =====
    res.status(201).json({
      message: `تمت معالجة الرحلة بنجاح: ${successfulLocations.length} مكان اترتبوا، إجمالي المسافة ${(totalDistance / 1000).toFixed(2)} كم`,
      tripId: trip._id,
      startPoint: trip.startPoint,
      totalDistanceMeters: totalDistance,
      totalDistanceKm: parseFloat((totalDistance / 1000).toFixed(2)),
      orderedLocations,
      failedLocations: failedLocations.map(loc => ({
        rawAddress: loc.rawAddress,
        reason: 'فشل تحويل العنوان لإحداثيات'
      })),
      successCount: successfulLocations.length,
      failedCount: failedLocations.length,
      pdfUrl // رابط نسبي - يتضاف له عنوان السيرفر من الفرونت، مثلاً: http://localhost:3000 + pdfUrl
    });

  } catch (err) {
    // نتأكد نمسح الملف المرفوع حتى لو حصل خطأ في أي خطوة
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('خطأ في معالجة الرحلة:', err);
    res.status(500).json({ error: 'حصل خطأ أثناء معالجة الرحلة', details: err.message });
  }
}

module.exports = { processTrip };
