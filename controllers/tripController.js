const ExcelJS = require('exceljs');
const fs = require('fs');
const Trip = require('../models/Trip');
const { geocodeLocationsList } = require('../utils/geocodeService');
const { optimizeRoute } = require('../utils/routeOptimizer');

/**
 * بيدور على عمود "الأماكن" جوه ملف الإكسل بشكل مرن
 * (يقبل أسماء أعمدة مختلفة زي: مكان، عنوان، الموقع، location, address)
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
 * POST /api/trips/upload
 * بياخد ملف إكسل، يقرا عمود الأماكن بس، وينشئ Trip جديدة بحالة "pending"
 */
async function uploadExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'محتاج ترفع ملف إكسل الأول' });
    }

    const { startLat, startLng } = req.body;
    if (!startLat || !startLng) {
      return res.status(400).json({
        error: 'محتاج تبعت إحداثيات نقطة البداية (startLat, startLng)'
      });
    }

    const filePath = req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // أول شيت في الملف
    const headerRow = worksheet.getRow(1);
    const locationColIndex = findLocationColumnIndex(headerRow);

    if (!locationColIndex) {
      fs.unlinkSync(filePath); // نضّف الملف المرفوع
      return res.status(400).json({
        error: 'معرفتش ألاقي عمود الأماكن. تأكد إن فيه عمود اسمه "مكان" أو "عنوان" أو "location"'
      });
    }

    // نقرا كل الصفوف ما عدا الهيدر
    const locations = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // تخطي صف العناوين

      const cellValue = row.getCell(locationColIndex).value;
      const rawAddress = cellValue ? cellValue.toString().trim() : null;

      if (rawAddress) {
        locations.push({
          originalIndex: rowNumber - 2, // 0-based بعد استبعاد الهيدر
          rawAddress,
          lat: null, // هيتحسب في خطوة الـ Geocoding الجاية
          lng: null,
          visitOrder: null,
          distanceFromPrevious: null
        });
      }
    });

    // نضّف الملف من على السيرفر بعد ما خلصنا قراءة
    fs.unlinkSync(filePath);

    if (locations.length === 0) {
      return res.status(400).json({ error: 'عمود الأماكن فاضي، مفيش حاجة نشتغل عليها' });
    }

    // ننشئ Trip جديدة بحالة pending (لسه محتاجة geocoding)
    const trip = await Trip.create({
      originalFileName: req.file.originalname,
      startPoint: {
        lat: parseFloat(startLat),
        lng: parseFloat(startLng),
        label: 'نقطة البداية'
      },
      locations,
      status: 'pending'
    });

    res.status(201).json({
      message: `تم رفع الملف بنجاح، لقينا ${locations.length} مكان`,
      tripId: trip._id,
      locationsCount: locations.length,
      status: trip.status
    });

  } catch (err) {
    console.error('خطأ في رفع الملف:', err);
    res.status(500).json({ error: 'حصل خطأ في معالجة الملف', details: err.message });
  }
}

/**
 * POST /api/trips/:id/geocode
 * بياخد Trip موجودة، يحوّل كل عناوينها لإحداثيات، ويحدّث حالتها
 */
async function geocodeTrip(req, res) {
  try {
    const { id } = req.params;
    const trip = await Trip.findById(id);

    if (!trip) {
      return res.status(404).json({ error: 'الرحلة دي مش موجودة' });
    }

    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'الرحلة دي خلصت تحسين خلاص' });
    }

    // نحدّث الحالة لـ geocoding عشان لو الفرونت بيستعلم، يعرف إحنا واقفين فين
    trip.status = 'geocoding';
    await trip.save();

    // العملية دي ممكن تاخد وقت (ثانية لكل عنوان جديد مش في الكاش)
    const updatedLocations = await geocodeLocationsList(trip.locations);

    trip.locations = updatedLocations;

    const failedCount = updatedLocations.filter(loc => loc.geocodeStatus === 'failed').length;
    const successCount = updatedLocations.length - failedCount;

    // لو كل العناوين فشلت، نعتبر الرحلة فشلت
    if (successCount === 0) {
      trip.status = 'failed';
      trip.errorMessage = 'كل العناوين فشلت في التحويل لإحداثيات';
      await trip.save();
      return res.status(422).json({
        error: 'كل العناوين فشلت في التحويل لإحداثيات، راجع صياغة العناوين',
        tripId: trip._id
      });
    }

    // الحالة بعد الـ geocoding تبقى pending لحساب المسار (لسه محتاجين خطوة التحسين)
    trip.status = 'pending';
    await trip.save();

    res.json({
      message: `تم تحويل ${successCount} عنوان بنجاح${failedCount > 0 ? ` و${failedCount} فشل` : ''}`,
      tripId: trip._id,
      successCount,
      failedCount,
      locations: trip.locations
    });

  } catch (err) {
    console.error('خطأ في الـ geocoding:', err);
    res.status(500).json({ error: 'حصل خطأ أثناء تحويل العناوين', details: err.message });
  }
}

/**
 * POST /api/trips/:id/optimize
 * بياخد Trip اتعمللها geocoding خلاص، وبيرتب أفضل مسار زيارة للنقاط الناجحة
 */
async function optimizeTripRoute(req, res) {
  try {
    const { id } = req.params;
    const trip = await Trip.findById(id);

    if (!trip) {
      return res.status(404).json({ error: 'الرحلة دي مش موجودة' });
    }

    // نفصل النقاط الناجحة (اللي عندها إحداثيات) عن الفاشلة
    const successfulLocations = trip.locations.filter(
      loc => loc.geocodeStatus === 'success' && loc.lat !== null && loc.lng !== null
    );
    const failedLocations = trip.locations.filter(
      loc => loc.geocodeStatus !== 'success' || loc.lat === null || loc.lng === null
    );

    if (successfulLocations.length === 0) {
      return res.status(400).json({
        error: 'مفيش أي نقطة عندها إحداثيات صالحة، اعمل geocoding الأول'
      });
    }

    trip.status = 'optimizing';
    await trip.save();

    // نشغّل الخوارزمية
    const { orderedLocations, totalDistance } = optimizeRoute(
      trip.startPoint,
      successfulLocations.map(loc => loc.toObject())
    );

    // نضم النقاط اللي فشلت (من غير ترتيب) في الآخر، عشان تفضل ظاهرة للمستخدم
    trip.locations = [...orderedLocations, ...failedLocations.map(loc => loc.toObject())];
    trip.totalDistance = totalDistance;
    trip.status = 'completed';
    await trip.save();

    res.json({
      message: `تم ترتيب المسار بنجاح، إجمالي المسافة ${(totalDistance / 1000).toFixed(2)} كم`,
      tripId: trip._id,
      totalDistanceMeters: totalDistance,
      totalDistanceKm: parseFloat((totalDistance / 1000).toFixed(2)),
      orderedLocations,
      skippedLocations: failedLocations.length
    });

  } catch (err) {
    console.error('خطأ في تحسين المسار:', err);
    res.status(500).json({ error: 'حصل خطأ أثناء حساب المسار', details: err.message });
  }
}

module.exports = { uploadExcel, geocodeTrip, optimizeTripRoute };
