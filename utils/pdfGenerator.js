const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { fetchStaticMapImage } = require('./staticMapService');
const { prepareArabicForPdf } = require('./arabicTextService');

const ARABIC_FONT_PATH = path.join(__dirname, '..', 'fonts', 'Amiri-Regular.ttf');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'pdfs');

// نتأكد إن فولدر إخراج الـ PDFs موجود
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * بيولّد ملف PDF كامل لرحلة معينة: قايمة بالترتيب + خريطة مصغرة
 * @param {Object} trip - مستند الـ Trip كامل (بعد التحسين)
 * @returns {Promise<string>} - اسم الملف اللي اتحفظ (مش المسار الكامل)
 */
// نبني التاريخ يدويًا بأرقام إنجليزية عادية، بدل الاعتماد على toLocaleDateString('ar-EG')
// اللي بترجع أحيانًا ترتيب أرقام غريب بسبب مشاكل ترميز الاتجاه (bidi) في بيئات مختلفة
function formatDateManually(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

async function generateTripPdf(trip) {
  const fileName = `trip-${trip._id}.pdf`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  const orderedLocations = trip.locations
    .filter(loc => loc.visitOrder !== null && loc.visitOrder !== undefined)
    .sort((a, b) => a.visitOrder - b.visitOrder);

  // نجيب صورة الخريطة (لو فشلت الشبكة، بنكمل من غيرها بدل ما نوقف كل حاجة)
  const mapImageBuffer = await fetchStaticMapImage(trip.startPoint, orderedLocations);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  // نسجل الخط العربي عشان نقدر نستخدمه
  doc.registerFont('Arabic', ARABIC_FONT_PATH);
  doc.font('Arabic');

  // ===== العنوان =====
  doc.fontSize(20).text(prepareArabicForPdf('مسار التوصيل'), { align: 'center' });
  doc.moveDown(0.5);

  doc.fontSize(11).fillColor('#555').text(
    prepareArabicForPdf(`تاريخ الإنشاء: ${formatDateManually(trip.createdAt || new Date())}`),
    { align: 'center' }
  );
  doc.text(
    prepareArabicForPdf(`إجمالي المسافة: ${(trip.totalDistance / 1000).toFixed(2)} كم`),
    { align: 'center' }
  );
  doc.text(
    prepareArabicForPdf(`عدد نقاط التوصيل: ${orderedLocations.length}`),
    { align: 'center' }
  );
  doc.fillColor('#000');
  doc.moveDown(1);

  // ===== الخريطة =====
  if (mapImageBuffer) {
    const imageWidth = 500;
    const pageWidth = doc.page.width;
    const xPosition = (pageWidth - imageWidth) / 2;
    doc.image(mapImageBuffer, xPosition, doc.y, { width: imageWidth });
    doc.moveDown(20); // مساحة بعد الخريطة (ارتفاعها التقريبي)
  } else {
    doc.fontSize(10).fillColor('#999').text(
      prepareArabicForPdf('تعذّر تحميل صورة الخريطة'),
      { align: 'center' }
    );
    doc.fillColor('#000');
    doc.moveDown(1);
  }

  // ===== قايمة نقاط الزيارة بالترتيب =====
  doc.fontSize(14).text(prepareArabicForPdf('ترتيب الزيارة'), { align: 'right' });
  doc.moveDown(0.5);

  orderedLocations.forEach((loc) => {
    const stepNumber = loc.visitOrder + 1;
    const distanceKm = (loc.distanceFromPrevious / 1000).toFixed(2);

    doc.fontSize(12).text(
      prepareArabicForPdf(`${stepNumber}. ${loc.rawAddress}`),
      { align: 'right' }
    );
    doc.fontSize(9).fillColor('#666').text(
      prepareArabicForPdf(`المسافة من النقطة السابقة: ${distanceKm} كم`),
      { align: 'right' }
    );
    doc.fillColor('#000');
    doc.moveDown(0.5);
  });

  // ===== العناوين اللي فشلت (لو في) =====
  const failedLocations = trip.locations.filter(
    loc => loc.geocodeStatus !== 'success' || loc.lat === null
  );

  if (failedLocations.length > 0) {
    doc.moveDown(1);
    doc.fontSize(13).fillColor('#c0392b').text(
      prepareArabicForPdf('عناوين لم يتم التعرف عليها (تحتاج مراجعة يدوية):'),
      { align: 'right' }
    );
    failedLocations.forEach(loc => {
      doc.fontSize(11).text(prepareArabicForPdf(`- ${loc.rawAddress}`), { align: 'right' });
    });
    doc.fillColor('#000');
  }

  doc.end();

  // بننتظر لحد ما الملف يتكتب فعليًا على القرص قبل ما نرجّع
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return fileName;
}

module.exports = { generateTripPdf };
