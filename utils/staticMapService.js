/**
 * بيولّد رابط صورة خريطة ثابتة (PNG) من خدمة Geoapify
 * توضّح نقطة البداية + كل نقاط التسليم بترتيبها + خط المسار بينهم
 *
 * ⚠️ ملحوظة: كنا بنستخدم خدمة staticmap.openstreetmap.de المجانية بالكامل
 * (من غير أي تسجيل)، لكن اكتشفنا إنها بقت متوقفة تمامًا (الدومين نفسه معدش موجود).
 * البديل الموثوق: Geoapify - لسه مجاني بالكامل (3000 طلب/يوم) ومن غير كارت ائتمان،
 * بس محتاج تسجيل حساب مجاني وأخذ API Key (خطوة تسجيل بسيطة، مش دفع).
 */

const GEOAPIFY_BASE_URL = 'https://maps.geoapify.com/v1/staticmap';

/**
 * بيبني رابط الخريطة الثابتة باستخدام Geoapify
 * @param {{lat: number, lng: number}} startPoint
 * @param {Array<{lat: number, lng: number, visitOrder: number}>} orderedLocations
 * @returns {string} رابط الصورة (PNG)
 */
function buildStaticMapUrl(startPoint, orderedLocations) {
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEOAPIFY_API_KEY مش موجود في ملف .env - سجّل حساب مجاني على geoapify.com وضيف المفتاح'
    );
  }

  const width = 600;
  const height = 400;

  // ماركر أخضر لنقطة البداية
  const startMarker = `lonlat:${startPoint.lng},${startPoint.lat};type:material;color:#27ae60;size:large`;

  // ماركرات زرقاء لباقي نقاط التسليم بترتيب الزيارة
  const deliveryMarkers = orderedLocations
    .map(loc => `lonlat:${loc.lng},${loc.lat};type:material;color:#2980b9;size:medium`)
    .join('|');

  const markers = `${startMarker}|${deliveryMarkers}`;

  // خط أحمر يوضح المسار بترتيب الزيارة (نقطة البداية + كل نقاط التسليم بالترتيب)
  // الصيغة الصحيحة: polyline:lng1,lat1,lng2,lat2,...;linecolor:#...;linewidth:...
  const routeCoordinates = [startPoint, ...orderedLocations]
    .map(p => `${p.lng},${p.lat}`)
    .join(',');
  const geometry = `polyline:${routeCoordinates};linecolor:#e74c3c;linewidth:4`;

  const params = new URLSearchParams({
    style: 'osm-bright',
    width: width.toString(),
    height: height.toString(),
    marker: markers,
    geometry,
    apiKey
  });

  return `${GEOAPIFY_BASE_URL}?${params}`;
}

/**
 * بيحمّل الصورة فعليًا كـ Buffer (عشان نضمّنها جوه PDF)
 * بيرجع null لو فشل التحميل (عشان الـ PDF يتولد برضو من غير خريطة بدل ما يقع بالكامل)
 */
async function fetchStaticMapImage(startPoint, orderedLocations) {
  try {
    const url = buildStaticMapUrl(startPoint, orderedLocations);
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`فشل تحميل الخريطة، status: ${response.status}`, errorBody);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (err) {
    console.error('خطأ في تحميل الخريطة الثابتة:', err.message);
    if (err.cause) {
      console.error('السبب التفصيلي:', err.cause);
    }
    return null;
  }
}

module.exports = { buildStaticMapUrl, fetchStaticMapImage };
